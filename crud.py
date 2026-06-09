from sqlalchemy import select, and_
from sqlalchemy.exc import SQLAlchemyError
from models import User, Workouts, Excersize, Weight, PRs,Macros,Meal
from auth import verify_password, hash_password
from db import get_db
import re
from dotenv import load_dotenv
import os
from google import genai
from pinecone import Pinecone
import datetime
from datetime import timezone
import firebase_admin
from firebase_admin import messaging, credentials
from datetime import date
from sqlalchemy import func
from google.genai import types
import json
from sqlalchemy import desc
import auth

load_dotenv()

PASSWORD_PATTERN = r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$'

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_API_KEY)

PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
pc = Pinecone(api_key=PINECONE_API_KEY)

model_id = "gemini-2.0-flash"

base_dir = os.path.dirname(os.path.abspath(__file__))
key_path = os.path.join(base_dir, "secrets", "serviceAccountKey.json")

if os.path.exists(key_path):
    cred = credentials.Certificate(key_path)
    firebase_admin.initialize_app(cred)


PASSWORD_PATTERN = r'^(?=.*[a-z])(??=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$'

def getUser(userName, password):
    db = get_db()
    statement = select(User).where(User.userName == userName)
    user = db.execute(statement).scalar_one_or_none()

    if not user:
        raise ValueError("User not found")

    if not verify_password(password, user.password):
        raise ValueError("Wrong username or password")

    return user


def createUser(userName, password, email):
    db = get_db()
    try:
        existing_user_stmt = select(User).where(User.userName == userName)
        existing_user = db.execute(existing_user_stmt).scalar_one_or_none()

        if existing_user is not None:
            raise ValueError("Username already exists")

        hashed_password = hash_password(password)
        
        new_user = User(
            userName=userName,
            email=email,
            password=hashed_password
        )
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        userData = {
            "user_name": new_user.userName,
            "user_id": new_user.id
        }
        
        accessToken = auth.createAccessToken(userData)
        refreshToken = auth.createRefreshToken(new_user.id)
        
        return accessToken, refreshToken

    except SQLAlchemyError as e:
        db.rollback()
        print(f"Database error during user creation: {e}")
        raise e


def changePassword(user_id, newPassword):
    db = get_db()

    if not re.match(PASSWORD_PATTERN, newPassword):
        raise ValueError("Password must be at least 8 characters long, include an uppercase letter, a lowercase letter, a number, and a special character.")

    user = User.query.get(user_id)
    if not user:
        raise ValueError("User not found")

    user.password = hash_password(newPassword)

    db.add(user)
    db.commit()


def delExcersize(ex_name,workout_id):
    db = get_db()
    workout = Workouts.query.get(workout_id)

    updated_ex = []
    for ex in workout.excersizes:
        if ex.ex_name != ex_name:
            updated_ex.append(ex)

    workout.excersizes = updated_ex

    db.add(workout)
    db.commit()


def delUser(user_id):
    db = get_db()
    user = User.query.get(user_id)
    
    db.delete(user)
    db.commit()

def addExcersize(workout_id,name,rep,set,weight,description):
    db = get_db()
    workout = Workouts.query.get(workout_id)

    excersize = Excersize(ex_name=name,reps = rep,sets = set,weight=weight,desc = description)

    workout.excersizes = excersize

    db.add(workout)
    db.commit()

def init_workout(user_id, duration, workout_type, notes):
    workout = Workouts(owner_id=user_id,duration_min = duration,notes=notes,type = workout_type)
    db = get_db()
    db.add(workout)
    db.commit()
    

def CompWorkouts(workout_id, user_id,):
    db = get_db()
    current_workout = db.query(Workouts).filter_by(
        id=workout_id, 
        owner_id=user_id
    ).first()

    workout_type = current_workout.type

    past_workouts = (
        db.query(Workouts)
        .filter(
            Workouts.owner_id == user_id,
            Workouts.type == workout_type,
            Workouts.created_at < current_workout.created_at
        )
        .order_by(desc(Workouts.created_at))
        .limit(4)
        .all()
    )

    past_workouts.reverse()

    def calculate_volume(workout_obj):
        total_volume = 0
        for ex in workout_obj.excersizes:
            sets = ex.sets or 0
            reps = ex.reps or 0
            weight = ex.weight or 0
            total_volume += (sets * reps * weight)
        return total_volume

    current_volume = calculate_volume(current_workout)
    past_volumes = [calculate_volume(w) for w in past_workouts]
    

    last_workout_volume = past_volumes[-1]
    beat_last_workout = current_volume > last_workout_volume


    avg_past_volume = sum(past_volumes) / len(past_volumes)
    beat_historical_average = current_volume > avg_past_volume

    achieved_progressive_overload = beat_last_workout or beat_historical_average

    return {
        "status": "success",
        "workout_id": workout_id,
        "workout_type": workout_type,
        "achieved_overload": achieved_progressive_overload,
        "current_volume": current_volume,
        "past_trend_volumes": past_volumes,
        "beat_last_workout": beat_last_workout,
    }

def delWorkout(workout_id,user_id):
    db = get_db()

    workout = db.query(Workouts).filter_by(
        id=workout_id, 
        owner_id=user_id
    ).first()

    db.delete(workout)
    db.commit()

    index = pc.Index("fitness-index")    
    vector_id = f"workout_{workout_id}"
    index.delete(ids=[vector_id])

    
def list_wk_data(workout_id):
    workout = Workouts.query.get(workout_id)
    owner = User.query.get(workout.owner_id)

    wk_excersizes = []
    for ex in workout.excersizes:
        excersize_data = {
            "excersize name":ex.ex_name,
            "reps":ex.reps,
            "sets":ex.sets,
            "weight":ex.weight,
            "description":ex.descr 
        }
        wk_excersizes.append(excersize_data)

    workout_data ={
        "type":workout.type,
        "duration":workout.duration_min,
        "created at":workout.created_at,
        "notes":workout.notes,
        "owner":owner.userName,
        "excersizes":wk_excersizes
    }
    return workout_data

def get_weight_data(user_id, days, model_class):
    db = get_db()
    enddate = datetime.datetime.now(timezone.utc)
    startdate = enddate - datetime.timedelta(days=days)

    statement = select(model_class).where(
        model_class.logged_at >= startdate,
        model_class.logged_at <= enddate,
        model_class.owner_id == user_id
    )
    
    records = db.execute(statement).scalars().all()
    weight_data = {}

    for rec in records:
        weight_data[str(rec.logged_at)] = rec.weight

    return weight_data

def get_max_lifts(user_id):
    db = get_db()
    
    statement = (
        select(PRs)
        .where(PRs.owner_id == user_id)
        .distinct(PRs.excersize_name)
        .order_by(PRs.excersize_name, PRs.weight.desc())
    )
    

    prs = db.execute(statement).scalars().all()
    
    return prs

def send_push_notification(token, title, body):
    message = messaging.Message(
        notification=messaging.Notification(
            title=title,
            body=body,
        ),
        token=token,
    )
    try:
        response = messaging.send(message)
        return response
    except Exception as e:
        print(f"Error sending notification: {e}")
        return None
    
def get_today_macro(db,user_id):
    today_macro = db.query(Macros).filter(
        Macros.owner_id == user_id,
        func.date(Macros.date) == date.today()
    ).first()

    if not today_macro:
        user = db.query(User).get(user_id)
        today_macro = Macros(
            owner_id=user_id,
            protein=0,
            carbs=0,
            fats=0,
            calories=0,
            macros_left=user.macro_defaults.copy()
        )
        db.add(today_macro)
        db.commit()
        db.refresh(today_macro)
        
    return today_macro

def generative_ai_query(prompt, image_bytes=None, expect_json=False):
    contents = [prompt]
    
    if image_bytes:
        contents.append(
            types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg")
        )

    config = types.GenerateContentConfig(
        response_mime_type="application/json" if expect_json else "text/plain"
    )

    response = client.models.generate_content(
        model=model_id,
        contents=contents,
        config=config
    )
    return response.text

def update_vector_db(workout_id, user_id):
    db = get_db()
    workout = db.query(Workouts).get(workout_id)
    if not workout:
        return False

    content = workout.get_rag_string()
    
    embedding_response = client.models.embed_content(
        model="text-embedding-004",
        contents=content
    )
    vector = embedding_response.embeddings[0].values

    index = pc.Index("fitness-index")
    index.upsert(vectors=[(
        f"workout_{workout_id}", 
        vector, 
        {"user_id": user_id, "text": content, "type": "workout"}
    )])

def update_vector_db_meal(meal_id,user_id):
    db = get_db()
    
    meal = db.query(Meal).filter_by(id=meal_id, owner_id=user_id).first()

    content = meal.get_rag_string()
    
    embedding_response = client.models.embed_content(
        model="text-embedding-004",
        contents=content
    )
    vector = embedding_response.embeddings[0].values

    index = pc.Index("fitness-index")
    index.upsert(vectors=[(
        f"meal_{meal_id}", 
        vector, 
        {"user_id": user_id, "text": content, "type": "meal"}
    )])

def delMeal(meal_id, user_id):
    db = get_db()

    meal = db.query(Meal).filter_by(
        id=meal_id, 
        owner_id=user_id
    ).first()

    db.delete(meal)
    db.commit()

    index = pc.Index("fitness-index")    
    vector_id = f"meal_{meal_id}"
    index.delete(ids=[vector_id])

def generate_search_queries(user_question):
    workout = Workouts.query.get(1)
    meal = Meal.query.get(1)

    workout_ex = workout.get_rag_string()
    meal_ex = meal.get_rag_string()

    prompt = f"""
    You are an AI search query generator for a fitness app.
    The user is asking their AI coach a question. Your ONLY job is to generate highly effective semantic search queries to pull ALL relevant historical data from our vector database. 
    
    CRITICAL: You must write queries that ensure we DO NOT miss any crucial historical data. Cast a wide enough semantic net to capture related exercises, related meals, and overarching trends (like fatigue, missed protein, or strength plateaus).

    DATABASE STRUCTURE & EXACT RAG STRING FORMATS:
    Our vector database stores data exactly like the examples below. Your queries must geometrically align with these sentence structures.

    1. Workout Vectors:
       Format Example :{workout_ex}
    
    2. Meal Vectors:
       Format Example :{meal_ex}

    USER QUESTION: "{user_question}"

    INSTRUCTIONS:
    1. Deeply analyze the user's question to understand what underlying data is needed to answer it properly.
    2. Generate a 'workout_query' that aligns with the workout RAG format to fetch all relevant lifting history.
    3. Generate a 'meal_query' that aligns with the meal RAG format to fetch all relevant nutritional history.
    4. If a category is completely irrelevant, set its value to null.
    5. Output ONLY valid JSON in the exact format below, with no markdown formatting, no backticks, and no extra text.

    {{
        "workout_query": "comprehensive query to catch all relevant workout data or null",
        "meal_query": "comprehensive query to catch all relevant meal data or null"
    }}
    """
    
    raw_response = generative_ai_query(prompt) 
    
    try:
        clean_json = raw_response.replace('```json', '').replace('```', '').strip()
        queries = json.loads(clean_json)
        return queries
    except Exception as e:
        print(f"Failed to parse query generation JSON: {e}")
        return {
            "workout_query": user_question, 
            "meal_query": user_question
        }
    


def get_full_user_context(user_id, question=None, top_k=7):
    """
    Assembles the complete context for the AI by combining static profile data,
    Personal Records, and targeted vector database retrieval.
    """
    db = get_db()
    user = db.query(User).get(user_id)
    if not user:
        return "User profile not found."

    prs_list = get_max_lifts(user_id)
    if prs_list:
        pr_strings = []
        for pr in prs_list:
            date_str = pr.created_at.strftime("%B %d, %Y") if pr.created_at else "Unknown date"
            reps = pr.reps or 1
            pr_strings.append(f"{pr.excersize_name}: {pr.weight}kg for {reps} reps (Logged: {date_str})")
        prs_formatted = "\n    ".join(pr_strings)
    else:
        prs_formatted = "No PRs logged yet."

    weight_val = user.get_weight
    weight_str = f"{weight_val}kg" if weight_val else "Not logged"
    sex_str = user.sex.value if user.sex else "Not specified"
    goal_str = user.goal.value if user.goal else "Not specified"
    
    static_context = f"""
        --- USER PROFILE ---
        Age: {user.age}
        Sex: {sex_str}
        Height: {user.height} cm
        Current Weight: {weight_str}
        Fitness Goal: {goal_str}
        Training Experience: {user.training_experience.value}
        Injuries/Conditions: {user.injuries or 'None'}
        Macro Goals: {user.macro_defaults}

        --- PERSONAL RECORDS (MAX LIFTS) ---
            {prs_formatted}
        --------------------
        """

    dynamic_context = ""
    
    if question:
        optimized_queries = generate_search_queries(question)
        index = pc.Index("fitness-index")
        
        if optimized_queries.get("workout_query"):
            try:
                emb_res = client.models.embed_content(
                    model="text-embedding-004",
                    contents=optimized_queries["workout_query"]
                )
                
                wk_results = index.query(
                    vector=emb_res.embeddings[0].values,
                    top_k=top_k,
                    filter={
                        "$and": [
                            {"user_id": {"$eq": user_id}},
                            {"type": {"$eq": "workout"}}
                        ]
                    },
                    include_metadata=True
                )
                
                wk_texts = [res['metadata']['text'] for res in wk_results['matches']]
                if wk_texts:
                    dynamic_context += "\n--- RELEVANT PAST WORKOUTS ---\n" + "\n".join(wk_texts)
            except Exception as e:
                print(f"Workout retrieval failed: {e}")

        if optimized_queries.get("meal_query"):
            try:
                meal_emb_res = client.models.embed_content(
                    model="text-embedding-004",
                    contents=optimized_queries["meal_query"]
                )
                
                meal_results = index.query(
                    vector=meal_emb_res.embeddings[0].values,
                    top_k=top_k,
                    filter={
                        "$and": [
                            {"user_id": {"$eq": user_id}},
                            {"type": {"$eq": "meal"}}
                        ]
                    },
                    include_metadata=True
                )
                
                meal_texts = [res['metadata']['text'] for res in meal_results['matches']]
                if meal_texts:
                    dynamic_context += "\n\n--- RELEVANT PAST MEALS ---\n" + "\n".join(meal_texts)
            except Exception as e:
                print(f"Meal retrieval failed: {e}")

    return static_context + (dynamic_context if dynamic_context else "\nNo relevant historical data found for this question.")

def infere_ai(user_id, question, history_messages=None):
    context = get_full_user_context(user_id, question)

    system_instruction = f"""
    You are an expert, empathetic, and highly analytical AI Fitness Coach. 
    Below is the user's profile, their max lifts (PRs), and relevant historical data (workouts and meals) retrieved based on their question.
    
    {context}
    
    Instructions:
    1. Answer the user's question directly, clearly, and concisely.
    2. Tailor your advice heavily to their specific profile (injuries, experience level, goals, current weight).
    3. Explicitly reference their past workouts or meals if relevant data is provided in the context. Show them you are actively tracking their progress.
    4. If the retrieved history shows issues (e.g., missed protein goals, dropping lift volume, no recent leg days), point it out constructively.
    5. Keep the tone motivating but strictly grounded in sports science and reality. Do not make up data.
    """

    contents = []
    if history_messages:
        recent_history = history_messages[-10:]
        for msg in recent_history:
            role = "user" if msg.get("role") == "user" else "model"
            contents.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg.get("content", ""))]
                )
            )
            
    contents.append(
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=question)]
        )
    )

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        response_mime_type="text/plain"
    )
    
    try:
        response = client.models.generate_content(
            model=model_id,
            contents=contents,
            config=config
        )
        return {"coach_response": response.text}
    except Exception as e:
        print(f"Error generating AI Coach response: {e}")
        return {"error": "I'm having trouble analyzing your data right now. Please try again in a moment."}

def estimate_macros(user_id, image_bytes, description):
    prompt = f"""
    Analyze this food image and the user's description.
    Estimate the total Calories, Protein (g), Carbs (g), and Fats (g).
    
    User Description: {description}
    
    You MUST return ONLY a valid JSON object matching this exact structure:
    {{
        "name": "A short descriptive name of the meal",
        "calories": 0,
        "protein": 0,
        "carbs": 0,
        "fats": 0
    }}
    """
    
    response_text = generative_ai_query(prompt, image_bytes=image_bytes, expect_json=True)
    
    try:
        data = json.loads(response_text)
    except json.JSONDecodeError:
        raise ValueError("AI failed to return valid JSON.")
    
    db = get_db()
    today_macro = get_today_macro(db, user_id)
    
    new_meal = Meal(
        name=data.get('name', 'AI Logged Meal'),
        protein=data.get('protein', 0),
        carbs=data.get('carbs', 0),
        fats=data.get('fats', 0),
        calories=data.get('calories', 0),
        owner_id=user_id,
        macro_id=today_macro.id
    )
    
    db.add(new_meal)
    db.commit()
    db.refresh(today_macro)
    
    return {
        "meal_logged": new_meal.name,
        "macros_added": data,
        "macros_left": today_macro.macros_left
    }