from flask import Flask, jsonify,request
from flask_cors import CORS
from models import User,BlacklistedTokens,Workouts,Weight,PRs,Member,ChatRoom,Meal,ChatMessage,Friendships,SavedWorkouts
import crud,models
from db import engine, init_app,get_db
import auth
from dotenv import load_dotenv
from sqlalchemy.exc import SQLAlchemyError
from tasks import cleanup_blacklistDB
from sqlalchemy import select, and_, or_, func
from flask_socketio import SocketIO, emit, join_room
import base64
from datetime import datetime, timedelta
from sqlalchemy import desc
from flask_socketio import leave_room

load_dotenv()

app = Flask(__name__)
CORS(app)
init_app(app)
socketio = SocketIO(app, cors_allowed_origins="*")

User.metadata.create_all(bind=engine)

    
@app.route("/logIn", methods=["POST"])
def logIn():
    try:
        data = request.get_json()
        
        if not data:
            userName = request.args.get("userName")
            password = request.args.get("password")
        else:
            userName = data.get("userName")
            password = data.get("password")

        
        if not userName or not password:
            return jsonify({"error": "Missing userName or password"}), 400

        user = crud.getUser(userName, password)
        
        if user is None:
            return jsonify({"error": "Invalid username or password"}), 401

        userData = {
            "user_name": user.userName,
            "user_id": user.id,
        }
        accessToken = auth.createAccessToken(userData)
        refreshToken = auth.createRefreshToken(user.id)
        return jsonify({"access_token": accessToken, "refresh_token": refreshToken}), 200
        
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 401
    except Exception as e:
        print(f"Server login exception details: {e}")
        return jsonify({"error": "Internal Server Error"}), 500
    
@app.route("/refresh", methods=["POST"])
def generateNewAccToken():
    try:
        ref_token = auth.get_token_from_header()
        payload = auth.verifyRefToken(ref_token)
        user_id = payload.get("user_id")
        user = User.query.get(user_id)
        userInfo = {
            "user_name": user.userName,
            "user_id": user_id,
        }
        accessToken = auth.createAccessToken(userInfo)
        return jsonify({"access_token": accessToken}), 200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500

@app.route("/signUp", methods=["POST"])
def register():  
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Missing JSON request body"}), 400
            
        userName = data.get("userName")
        password = data.get("password")
        email = data.get("email")

        
        if not userName or not password or not email:
            return jsonify({"error": "Missing required fields (userName, password, email)"}), 400
            
        accessToken,refreshToken = crud.createUser(userName, password, email)
        return jsonify({"access_token": accessToken, "refresh_token": refreshToken}), 200 
        
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500
    
@app.route("/logout", methods=["POST"])
def logout():
    try:    
        token = auth.get_token_from_header()

        data = request.get_json()
        refresh_token = data.get("refresh_token")

        db = get_db()
        blacklisted = BlacklistedTokens(token = token)
        db.add(blacklisted)

        blacklisted = BlacklistedTokens(token = refresh_token)
        db.add(blacklisted)

        db.commit()
        
        return jsonify({"message": "Logged out successfully"}), 200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500
    
@app.route("/get_user_details",methods = ["GET"])
def get_user_details():
    try:
        user_id,_ = auth.extract_user_info_from_acToken()
        user = User.query.get(user_id)

        user_info = {
            "name":user.userName,
            "email":user.email,
            "age":user.age,
            "height":user.height,
            "weight":user.get_weight(),
            "sex":user.sex.value if user.sex else None,
            "injuries":user.injuries,
            "goal":user.goal.value if user.goal else None,
            "training experience":user.training_experience.value
        }

        return jsonify(user_info),200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500

@app.route("/log_weight/<new_weight>/<bodyfat>",methods = ["PATCH"])
def update_weight(new_weight,bodyfat):
    try:
        db = get_db()

        user_id,_ = auth.extract_user_info_from_acToken()
        user = User.query.get(user_id)

        weight = Weight(weight = new_weight,bodyfatpercentage = bodyfat,author = user)

        db.add(weight)
        db.commit()

        return jsonify({"message": "Weight updated successfully"}),200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500

@app.route("/log_injuries/<new_injuries>",methods = ["PATCH"])
def update_injuries(new_injuries):
    try:
        db = get_db()
        user_id,_ = auth.extract_user_info_from_acToken()
        user = User.query.get(user_id)
        
        user.injuries = new_injuries
        db.commit()

        return jsonify({"message": "Injury data updated successfully"}),200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500
@app.route("/change_password", methods=["PATCH"])
def ChangePassword():
    try:
        user_id, _ = auth.extract_user_info_from_acToken()
        data = request.get_json()
        if not data or "newPassword" not in data:
            return jsonify({"error": "Missing 'newPassword' in request body"}), 400
            
        newPassword = data["newPassword"]
        crud.changePassword(user_id, newPassword)
        return jsonify({"message": "Password changed successfully"}), 200
        
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500
    
@app.route("/set_user_details/<weights>/<age>/<sex>/<height>/<goal>/<injuries>/<training_experience>/<bodyfat>",methods = ["POST"])
def set_user_details(weights,age,sex,height,goal,injuries,training_experience,bodyfat):
    try:
        db = get_db()

        user_id,_ = auth.extract_user_info_from_acToken()
        user = User.query.get(user_id)

        data = request.get_json() or {}

        weight = Weight(weight = weights,bodyfatpercentage = bodyfat,author = user)
        user.age = age
        user.height = height
        
        sex_val = data.get('sex', sex).lower()
        gender_choice = models.GenderEnum[sex_val]
        user.sex = gender_choice
        
        goal_val = data.get('goal', goal).lower()
        goal_enum = models.FitnessGoalEnum[goal_val]
        user.goal = goal_enum
        
        user.injuries = injuries
        train_exp_val = training_experience
        train_exp_enum = models.TrainingLevelEnum[train_exp_val]
        user.training_experience = train_exp_enum

        db.add(weight)
        db.add(user)
        db.commit()
        return jsonify({"message": "User details set successfully"}), 200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500
        
@app.route("/del_user", methods=["DELETE"])
def delUser():
    try:
        user_id,_ = auth.extract_user_info_from_acToken()
        crud.delUser(user_id)
        return jsonify({"message": "User deleted successfully"}), 200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500
    
@app.route("/log_workout", methods=["POST"])
def log_workout():
    try:
        user_id, _ = auth.extract_user_info_from_acToken()
        data = request.get_json()
        
        duration = data.get("duration")
        workout_type = data.get("type")
        notes = data.get("notes", "")

        if not duration or not workout_type:
             return jsonify({"error": "Duration and Type are required"}), 400

        workout_id = crud.init_workout(user_id, duration, workout_type, notes)
        
        return jsonify({"message": "Workout initialized successfully", "workout_id": workout_id}), 200

    except Exception as e:
        return jsonify({"error": f"{e}"}), 500
    
@app.route("/save_workout_as_template/<int:workout_id>", methods=["POST"])
def save_template(workout_id):
    try:
        user_id, _ = auth.extract_user_info_from_acToken()
        db = get_db()
        
        workout = db.query(Workouts).filter(Workouts.id == workout_id, Workouts.owner_id == user_id).first()
        if not workout:
            return jsonify({"error": "Workout not found"}), 404
            
        existing_save = db.query(SavedWorkouts).filter_by(workout_id=workout_id, owner_id=user_id).first()
        if existing_save:
            return jsonify({"message": "Workout is already saved as a template"}), 200
            
        new_save = SavedWorkouts(workout_id=workout_id, owner_id=user_id)
        db.add(new_save)
        db.commit()
        
        return jsonify({"message": "Workout saved as template successfully!"}), 200
        
    except Exception as e:
        return jsonify({"error": f"{e}"}), 500

@app.route("/add_excersize/<workout_id>/<name>/<rep>/<set>/<weight>/<desc>",methods=["POST"])
def add_excersize(workout_id,name,rep,set,weight,desc):
    try:
        crud.addExcersize(workout_id,name,rep,set,weight,desc)
        return jsonify({"message": "Excersize added successfully"}),200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500
    
@app.route("/delete_excersize/<ex_name>/<workout_id>",methods = ["DELETE"])
def del_excersize(ex_name,workout_id):
    try:
        crud.delExcersize(ex_name,workout_id)
        return jsonify({"message": "Excersize deleted successfully"}),200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500
    
@app.route("/list_workout_data/<workout_id>",methods = ["GET"])
def print_wk_data(workout_id):
    try:
        workout_data = crud.list_wk_data(workout_id)
        return jsonify(workout_data),200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500

    
@app.route("/finish_workout/<workout_id>",methods = ["POST"])
def comp_workouts(workout_id):
    try:
        user_id,_ = auth.extract_user_info_from_acToken()
        crud.update_vector_db(workout_id,user_id)
        has_progressed = crud.CompWorkouts(workout_id,user_id)
            
        return jsonify(has_progressed),200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500
    
@app.route("/delete_workout/<workout_id>",methods = ["DELETE"])
def del_workout(workout_id):
    try:
        user_id,_ = auth.extract_user_info_from_acToken()
        crud.delWorkout(workout_id,user_id)

        return jsonify({"message": "Workout deleted successfully"}),200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500

@app.post("/ask_coach")
def ask_ai_coach(payload: dict):
    try:
        user_id,_ = auth.extract_user_info_from_acToken()

        question = payload.get("question")
               
        history = payload.get("history", [])

        result = crud.infere_ai(
            user_id=user_id, 
            question=question, 
            history_messages=history
        )

        return jsonify(result),200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500
    
    
@app.route("/get_weight_chart_data/<days>",methods = ["GET"])
def get_weight_data(days):
    try:
        user_id,_ = auth.extract_user_info_from_acToken()
        weight_data = crud.get_weight_data(user_id,days,Weight)

        return jsonify(weight_data),200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500

@app.route("/get_strength_chart_data/<days>",methods = ["GET"])
def get_strength_data(days):
    try:
        user_id,_ = auth.extract_user_info_from_acToken()
        weight_data = crud.get_weight_data(user_id,days,PRs)

        return jsonify(weight_data),200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500

@app.route("/get_room_id/<recipient_id>",methods = ["GET"])
def get_create_chat(recipient_id):
    try:
        db = get_db()
        user_id,_ = auth.extract_user_info_from_acToken()

        existing_room = db.query(Member.room_id).filter(
            Member.member_id.in_([user_id, recipient_id])
        ).group_by(Member.room_id).having(func.count(Member.room_id) == 2).first()

        if existing_room:
            return jsonify(existing_room),200
        
        statement = select(Friendships).where(or_(
            and_(Friendships.user_id == user_id, Friendships.friend_id == recipient_id, Friendships.status == "accepted"),
            and_(Friendships.user_id == recipient_id, Friendships.friend_id == user_id, Friendships.status == "accepted")
        ))
        are_friends = db.execute(statement).scalars().first()
        if not are_friends:
            return jsonify({"error": "You are not friends. Chat cannot be created"}),403

        chatRoom = ChatRoom()
        db.add(chatRoom)
        db.flush()

        member1 = Member(member_id = user_id,room_id = chatRoom.id)
        member2 = Member(member_id = recipient_id,room_id  = chatRoom.id)

        db.add_all([member1,member2])
        db.commit()

        return jsonify({"room_id":chatRoom.id}),200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500
    
@socketio.on('join_chat')
def handle_join_chat(data):
    try:
        db = get_db()
        room_id = data.get('room_id')
        user_id, _ = auth.extract_user_info_from_acToken()
        
        is_member = db.execute(
            select(Member).where(and_(Member.room_id == room_id, Member.member_id == user_id))
        ).scalar()

        if not is_member:
            return False
            
        join_room(room_id)
        print(f"User {user_id} joined live chat room {room_id}")
        
    except Exception as e:
        print(f"Error joining chat: {e}")
        return False

@socketio.on('leave_chat')
def handle_leave_chat(data):
    try:
        room_id = data.get('room_id')
        leave_room(room_id)
    except Exception as e:
        print(f"Error leaving chat: {e}")

@app.route("/get_chat_history/<room_id>",methods = ["GET"])
def get_history(room_id):
    try:
        db = get_db()
        user_id,_ = auth.extract_user_info_from_acToken()
        
        is_member = db.execute(select(Member).where(and_(Member.room_id == room_id, Member.member_id == user_id))).scalar()

        if not is_member:
            return jsonify({"error": "Access denied"}), 403

        statement = (
        select(ChatMessage, User.userName).join(User, ChatMessage.sender_id == User.id).where(ChatMessage.room_id == room_id))
        results = db.execute(statement).all()

        messages_data = []

        for message, username in results:
            dic = {
                "message_id": message.id,
                "username": username,
                "content": message.content,
                "created at": message.created_at,
                "workout_id": message.workout_id
            }

            messages_data.append(dic)

        return jsonify(messages_data), 200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500

@socketio.on('send_msg')
def handle_send_message(data):
    try:
        db = get_db()

        room_id = data['room_id']
        content = data['content']
        workout_id = data['workout_id']

        user_id,userName = auth.extract_user_info_from_acToken()
        
        is_member = db.execute(select(Member).where(and_(Member.room_id == room_id, Member.member_id == user_id))).scalar()

        if not is_member:
            return False

        message = ChatMessage(room_id = room_id,content = content,workout_id = workout_id,sender_id = user_id)
        db.add(message)
        db.commit()

        emit('receive_msg', {"sender": userName,"content": data['content'],"created_at":str(message.created_at),"workout_id":workout_id}, room=data['room_id'])
    except Exception as e:
        print(f"Error in send_msg: {e}")
        return False
    
@app.route("/get_inbox", methods=["GET"])
def get_inbox():
    try:
        db = get_db()
        user_id, _ = auth.extract_user_info_from_acToken()
        
        latest_messages = (
            select(ChatMessage)
            .distinct(ChatMessage.room_id)
            .order_by(ChatMessage.room_id, ChatMessage.created_at.desc())
        ).subquery('latest_messages')

        unread_counts = (
            select(
                ChatMessage.room_id, 
                func.count(ChatMessage.id).label('unread_count')
            )
            .where(and_(ChatMessage.sender_id != user_id, ChatMessage.is_read == False))
            .group_by(ChatMessage.room_id)
        ).subquery('unread_counts')

        my_rooms = select(Member.room_id).where(Member.member_id == user_id)

        statement = (
            select(
                Member.room_id,
                User.id.label('friend_id'),
                User.userName.label('friend_name'),
                User.email.label('friend_email'),
                latest_messages.c.content.label('last_message'),
                latest_messages.c.created_at.label('last_timestamp'),
                func.coalesce(unread_counts.c.unread_count, 0).label('unread_count')
            )
            .join(User, User.id == Member.member_id)
            .outerjoin(latest_messages, latest_messages.c.room_id == Member.room_id)
            .outerjoin(unread_counts, unread_counts.c.room_id == Member.room_id)
            .where(
                and_(
                    Member.room_id.in_(my_rooms),
                    Member.member_id != user_id
                )
            )
            .order_by(latest_messages.c.created_at.desc().nulls_last())
        )
        
        results = db.execute(statement).all()

        inbox_data = []
        for row in results:
            inbox_data.append({
                "room_id": row.room_id,
                "friend_id": row.friend_id,
                "friend_name": row.friend_name,
                "last_message": row.last_message or "New chat started. Say hi!",
                "last_timestamp": row.last_timestamp.isoformat() if row.last_timestamp else None,
                "unread_count": int(row.unread_count)
            })
            
        return jsonify(inbox_data), 200

    except Exception as e:
        db.rollback()
        print(f"Inbox parsing exception details: {e}")
        return jsonify({"error": "Failed to load live inbox data"}), 500

@socketio.on('typing')
def handle_typing_makrker(data):
    try:
        db = get_db()

        room_id = data['room_id']
        user_id,userName = auth.extract_user_info_from_acToken()

        is_member = db.execute(select(Member).where(and_(Member.room_id == room_id, Member.member_id == user_id))).scalar()

        if not is_member:
            return False
        
        emit('typing',{"username":userName},room = data['room_id'],include_self=False)
    except Exception as e:
        print(f"Error in typing: {e}")
        return False

@socketio.on('stop_typing')
def handle_stop_typing(data):
    try:
        room_id = data['room_id']
        emit('user_stopped', room=room_id, include_self=False)
    except Exception as e:
        print(f"Error in stop_typing: {e}")
        return False

@app.route("/delete_message/<message_id>",methods = ["DELETE"])
def del_message(message_id):
    try:
        db = get_db()
        user_id, _ = auth.extract_user_info_from_acToken()
        
        message = db.query(ChatMessage).get(message_id)

        if not message:
            return jsonify({"error": "Message not found"}), 404
            
        if message.sender_id != user_id:
            return jsonify({"error": "Unauthorized to delete this message"}), 403

        db.delete(message)
        db.commit()
        return jsonify({"Success": "Message deleted successfully"}), 200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500

@socketio.on('login_connect')
def handle_login(data):
    try:
        user_id = data['user_id']
        join_room(f"user_{user_id}")
    except Exception as e:
        print(f"Error in login_connect: {e}")

@app.route("/send_fr_request/<recipient_id>",methods = ["POST"])
def send_req(recipient_id):
    try:
        db = get_db()
        user_id, userName = auth.extract_user_info_from_acToken()

        if str(user_id) == str(recipient_id):
            return jsonify({"error": "You cannot friend yourself."}), 400

        statement = select(Friendships).where(or_(
            and_(Friendships.user_id == user_id, Friendships.friend_id == recipient_id),
            and_(Friendships.user_id == recipient_id, Friendships.friend_id == user_id)
        ))
        existing_friendship = db.execute(statement).scalars().first()

        if existing_friendship:
            if existing_friendship.status == "pending":
                if str(existing_friendship.user_id) == str(recipient_id):
                    return jsonify({"error": "This user already sent you a request. Check your pending requests."}), 400
                else:
                    return jsonify({"error": "You have already requested this user."}), 400
            
            elif existing_friendship.status == "accepted":
                return jsonify({"error": "You are already friends with this user."}), 400
                
            elif existing_friendship.status == "declined":
                return jsonify({"error": "Friend request cannot be sent."}), 400

        friendship1 = Friendships(user_id=user_id, friend_id=recipient_id)
        
        db.add(friendship1)
        db.commit()

        emit('new_friend_request', {"sender": userName, "friendship_id": user_id}, room=f"user_{recipient_id}")
        
        return jsonify({"message": "Friend request sent"}), 200      
    except Exception as e:
        db.rollback()
        return jsonify({"error": f"{e}"}), 500

@app.route("/accept_req/<accepted>/<sender_id>")
def respond(accepted,sender_id):
    try:
        db = get_db()

        responder_id,_ = auth.extract_user_info_from_acToken()

        statement = select(Friendships).where(and_(Friendships.user_id == sender_id, Friendships.friend_id == responder_id))
        friendship = db.execute(statement).scalars().first()

        if not friendship:
            return jsonify({"error": "Friend request not found"}), 404

        if str(accepted).lower() == "true":
            friendship.status = "accepted"
            db.add(friendship)
        else:
            friendship.status = "declined"
            db.add(friendship)

        db.commit()

        return jsonify({"message": "Friend request responded"}),200 
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500

@app.route("/see_requests/")
def get_reqs():
    try:
        db = get_db()

        user_id,_ = auth.extract_user_info_from_acToken()

        statement = select(Friendships).where(and_(Friendships.friend_id == user_id, Friendships.status == "pending"))
        requests = db.execute(statement).scalars().all()

        return jsonify([{"user_id": req.user_id, "friend_id": req.friend_id, "status": req.status} for req in requests]),200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500
    
@app.route("/list_friends",methods =["GET"])
def list_friends():
    try:
        user_id,_ = auth.extract_user_info_from_acToken()
        user = User.query.get(user_id)

        return jsonify(user.all_friends),200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500

@app.route("/log_pr/<Weight>/<Reps>/<Excersize_name>",methods = ["POST"])
def log_pr(Weight,Reps,Excersize_name):
    try:
        db = get_db()

        user_id,_ = auth.extract_user_info_from_acToken()
        user = User.query.get(user_id)

        newPr = PRs(weight = Weight,reps = Reps,excersize_name = Excersize_name,author = user)

        db.add(newPr)
        db.commit()

        return jsonify({"sucess":"PR logged successfully"}),200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500
    
@app.route("/del_pr/<pr_id>",methods = ["DELETE"])
def del_pr(pr_id):
    try:
        db = get_db()

        pr = PRs.query.get(pr_id)

        db.delete(pr)
        db.commit()

        return jsonify({"success":"PR deleted successfully"}),200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500
    
@app.route("/get_max_lifts",methods = ["GET"])
def max_lifts():
    try:
        user_id,_ = auth.extract_user_info_from_acToken()
        max_lifts = crud.get_max_lifts(user_id)

        return jsonify(max_lifts),200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500
    
@app.route("/update_fcm_token",methods = ["POST"])
def update_token():
    try:
        db = get_db()

        user_id,_ = auth.extract_user_info_from_acToken()
        token = request.json.get('fcm_token')

        if not token:
            return jsonify({"error":"No token provided"}),400
        
        user = User.query.get(user_id)
        user.fcm_token = token

        db.add(user)
        db.commit()

        return jsonify({"success":"Toekn updated successfully"}),200
    except Exception as e :
        return jsonify({"error": f"{e}"}), 500
    
    
@app.route('/log_meal_ai', methods=['POST'])
def log_meal_ai():
    try:
        file = request.files['image']
        
        description = request.form.get('description', '')

        image_bytes = file.read()

        base64_image = base64.b64encode(image_bytes).decode('utf-8')

        user_id,_ = auth.extract_user_info_from_acToken()

        cal_data = crud.estimate_macros(user_id,base64_image,description)
        return jsonify(cal_data),200
    except Exception as e:
        return jsonify({"Error":f"{e}"}),500
    
@app.route("/del_meal/meal_id",methods = ["DELETE"])
def del_meal(meal_id):
    try:
        user_id,_ = auth.extract_user_info_from_acToken()
        crud.delMeal(meal_id,user_id)
        
        return jsonify({"Success":"Meal deleted successfully"}),200
    except Exception as e:
        return jsonify({"error":f"{e}"}),500

@app.route("/log_meal_manual/<meal_name>/<protein>/<carbs>/<fats>/<calories>",methods = ["POST"])
def log_meal_manual(meal_name,protein,carbs,fats,calories):
    try:
        db = get_db()

        user_id, userName = auth.extract_user_info_from_acToken()

        macros = crud.get_today_macro(db,user_id)
        meal = Meal(
            macro_id = macros.id,
            owner_id = user_id,
            name = meal_name,
            protein = protein,
            carbs = carbs,
            fats = fats,
            calories = calories,
        )

        db.add(meal)
        db.commit()

        return jsonify({"Sucess":"Meal logged sucessfully"}),200
    except Exception as e:
        return jsonify({"error":f"{e}"}),500


@app.route("/Edit_macros_meal/<meal_id>/<meal_name>/<protein>/<carbs>/<fats>/<calories>",methods = ["POST"])
def edit_macros(meal_id,meal_name=None,protein = None,carbs = None,fats = None,calories=None):
    try:
        db = get_db()

        meal = Meal.query.get(meal_id)

        if meal_name is not None:
            meal.name = meal_name
        if protein is not None:
            meal.protein = protein
        if carbs is not None:
            meal.carbs = carbs
        if fats is not None:
            meal.fats = fats
        if calories is not None:
            meal.calories = calories

        db.add(meal)
        db.commit()

        return jsonify({"Success":"Meal macros updated successfully"}),200
    except Exception as e:
        return jsonify({"error":f"{e}"}),500
    
@app.route("/Edit_daily_macros/<protein>/<carbs>/<fats>/<calories>",methods = ["POST"])
def edit_daily_macros(protein = None,carbs = None,fats = None,calories=None):
    try:
        db = get_db()

        user_id, userName = auth.extract_user_info_from_acToken()
        today_macros = crud.get_today_macro(db,user_id) 

        if protein is not None:
            new_protein = protein
            today_macros.protein = protein
        else:
            new_protein = today_macros.protein
        if carbs is not None:
            new_carbs = carbs
            today_macros.carbs = carbs
        else:
            new_carbs = today_macros.carbs
        if fats is not None:
            new_fats = fats
            today_macros.fats = fats
        else:
            new_fats = today_macros.fats
        if calories is not None:
            new_cals = calories
            today_macros.calories = calories
        else:
            new_cals = today_macros.calories

        user = User.query.get(user_id)


        today_macros.macros_left = {
            "protein":user.macro_defaults["protein"] - new_protein,
            "carbs":user.macro_defaults["carbs"] - new_carbs,
            "fats":user.macro_defaults["fats"] - new_fats,
            "calories":user.macro_defaults["calories"] - new_cals,
        }

        db.add(today_macros)
        db.commit()

        return jsonify({"Success":"Daily macros updated successfully"})
    except Exception as e:
        return jsonify({"error":f"{e}"}),500
    
@app.route("/get_meal_data",methods = ["GET"])
def get_meal_data():
    try:
        db = get_db()

        user_id,_ = auth.extract_user_info_from_acToken()
        todays_macros = crud.get_today_macro(db,user_id)

        macro_id = todays_macros.id
        statement = select(Meal).where(Meal.macro_id == macro_id)
        meals = db.execute(statement).scalars().all()

        all_meals = []
        for meal in meals:
            meal_data = {
                "protein":meal.protein,
                "carbs":meal.carbs,
                "fats":meal.fats,
                "calories":meal.calories,
            }

            all_meals.append(meal_data)

        macros_data = {
            "protein":todays_macros.protein,
            "carbs":todays_macros.carbs,
            "fats":todays_macros.fats,
            "calories":todays_macros.calories,
        }
        all_meals.append(macros_data)
        all_meals.append(todays_macros.macros_left)

        return jsonify(all_meals),200
    except Exception as e:
        return jsonify({"error":f"{e}"}),500

@app.route("/unsave_workout/<Workout_id>",methods = ["DELETE"])
def unsave_wokrout(Workout_id):
    try:
        db = get_db()

        workout = SavedWorkouts.query.get(Workout_id)

        db.delete(workout)
        db.commit()

        return jsonify({"Success":"Workout unsaved successfully"}),200
    except Exception as e:
        return jsonify({"error":f"{e}"}),500
    
@app.route("/list_saved_wk",methods = ["GET"])
def list_s_wk():
    try:
        user_id,_ = auth.extract_user_info_from_acToken()
        user = User.query.get(user_id)

        all_wk = []
        for workout in user.saved_wokrouts:
            workout_data = crud.list_wk_data(workout.workout_id)

            all_wk.append(workout_data)
        
        return jsonify(all_wk),200
    except Exception as e:
        return jsonify({"error":f"{e}"}),500
    
@app.route("/retrieve_recent_workouts", methods=["GET"])
def get_past_wk():
    try:
        db = get_db()
        user_id, _ = auth.extract_user_info_from_acToken()
        
        # Get pagination parameters from URL query (e.g., ?page=1&limit=10)
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 10))
        offset = (page - 1) * limit

        statement = (
            select(Workouts)
            .where(Workouts.owner_id == user_id)  # Note: ensure this matches your model (owner_id vs author_id)
            .order_by(desc(Workouts.created_at))
            .offset(offset)
            .limit(limit)
        )
        
        workouts = db.execute(statement).scalars().all()
        
        # Format the response
        workout_list = []
        for wk in workouts:
            workout_list.append({
                "id": wk.id,
                "type": wk.type,
                "duration_min": wk.duration_min,
                "notes": wk.notes,
                "created_at": wk.created_at.isoformat() if wk.created_at else None
            })
            
        return jsonify({
            "workouts": workout_list,
            "page": page,
            "limit": limit
        }), 200
        
    except Exception as e:
        return jsonify({"error": f"{e}"}), 500
    
@app.route("/update_excersize", methods=["PUT"])
def update_excersize():
    try:
        user_id, _ = auth.extract_user_info_from_acToken()
        data = request.get_json()
        
        workout_id = data.get("workout_id")
        ex_name = data.get("ex_name")
        new_sets = data.get("sets")
        new_reps = data.get("reps")
        new_weight = data.get("weight")
        
        if not workout_id or not ex_name:
            return jsonify({"error": "workout_id and ex_name are required"}), 400
            
        updated = crud.update_excersize(workout_id, user_id, ex_name, new_sets, new_reps, new_weight)
        
        if updated:
            return jsonify({"message": "Exercise updated successfully"}), 200
        else:
            return jsonify({"error": "Could not update exercise"}), 400

    except Exception as e:
        return jsonify({"error": f"{e}"}), 500
    
    
if __name__ == "__main__":
    socketio.run(app, debug=True, port=5000)




