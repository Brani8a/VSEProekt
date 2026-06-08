from sqlalchemy import Column, String, Integer,DateTime,JSON,ForeignKey,Float,Enum,Boolean,func
from sqlalchemy.orm import relationship
from sqlalchemy.orm import DeclarativeBase,validates
from datetime import datetime,timezone
from sqlalchemy import select
from db import get_db
import enum
import re
from sqlalchemy.ext.mutable import MutableDict
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import text

EMAIL_REGEX = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'

class GenderEnum(enum.Enum):
    male = "male"
    female = "female"
    other = "other"

class TrainingLevelEnum(enum.Enum):
    begginer = "begginer"
    intermediate = "intermediate"
    advanced = "advanced"
    elite = "elite"

class FitnessGoalEnum(enum.Enum):
    hypertrophy = "hypertrophy"
    fatloss = "fatloss"
    maintanence = "maintanance"
    strenght_gain = "strenght gain"
    healthier_lifestyle = "healthier lifestyle"

class Base(DeclarativeBase):
    pass

class Friendships(Base):
    __tablename__ = "friendships"

    user_id = Column(Integer,ForeignKey('users.id', ondelete="CASCADE"),nullable = False,primary_key=True)
    friend_id = Column(Integer,ForeignKey('users.id', ondelete="CASCADE"),nullable = False,primary_key=True)

    status = Column(String,default = "pending")
    created_at = Column(DateTime,server_default=func.now())

class ChatRoom(Base):
    __tablename__ = "chatrooms"

    id = Column(Integer,primary_key=True)
    messages = relationship('ChatMessage',backref = 'room',cascade="all, delete-orphan",lazy = True)
    members = relationship('Member',backref = 'room',cascade="all, delete-orphan",lazy = True)

class Member(Base):
    __tablename__ = "members"

    member_id = Column(Integer,ForeignKey('users.id', ondelete="CASCADE"),nullable = False,primary_key = True)
    room_id = Column(Integer,ForeignKey('chatrooms.id', ondelete="CASCADE"),nullable = False,primary_key = True)
    is_active = Column(Boolean)

class ChatMessage(Base):
    __tablename__ = "messages"

    id = Column(Integer,primary_key=True)
    room_id = Column(Integer,ForeignKey('chatrooms.id', ondelete="CASCADE"))
    sender_id = Column(Integer,ForeignKey('users.id', ondelete="CASCADE"),nullable = False)
    workout_id = Column(Integer,ForeignKey('workouts.id', ondelete="SET NULL"),nullable = True)
    content = Column(String(1000))
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone = True),server_default=func.now())

class Meal(Base):
    __tablename__ = "meals"

    id = Column(Integer,primary_key=True)
    name = Column(String(200))
    owner_id = Column(Integer,ForeignKey('users.id'),nullable = False)
    macro_id = Column(Integer,ForeignKey('macros.id'),nullable = False)
    protein = Column(Integer)
    carbs = Column(Integer)
    fats = Column(Integer)
    calories = Column(Integer)

    def get_rag_string(self):

        return (f"The user ate a meal named '{self.name}'. "
                f"It contained {self.calories or 0} calories, "
                f"consisting of {self.protein or 0}g of protein, "
                f"{self.carbs or 0}g of carbohydrates, and {self.fats or 0}g of fats.")

class Macros(Base):
    __tablename__ = "macros"

    id = Column(Integer,primary_key = True)
    date = Column(DateTime(timezone=True), server_default=func.now())
    protein = Column(Integer)
    carbs = Column(Integer)
    fats = Column(Integer)
    calories = Column(Integer)
    owner_id = Column(Integer,ForeignKey('users.id'),nullable = False)

    def default_macros():
        return {
        "protein": 0,
        "carbs": 0,
        "fats": 0,
        "calories": 0
    }

    macros_left = Column(MutableDict.as_mutable(JSONB),server_default=text('{"protein": 0, "carbs": 0, "fats": 0, "calories": 0}'),default=default_macros)

    @validates('macros_left')
    def validate_macros(self, value):
        required_keys = {'protein', 'carbs', 'fats', 'calories'}
        
        if not isinstance(value, dict):
            raise ValueError("macro_defaults must be a dictionary")
            
        missing = required_keys - set(value.keys())
        if missing:
            raise ValueError(f"Missing required macro keys: {missing}")
            
        return value

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    userName = Column(String, unique=True)
    password = Column(String, unique=False)
    email = Column(String)
    

    weight = relationship('Weight',backref = 'author',lazy = True)
    height = Column(Float)
    age = Column(Integer)
    sex = Column(Enum(GenderEnum))

    def get_weight(self):
        if not self.weight:
            return None
        
        latest = max(self.weight,key = lambda x:x.logged_at)
        return latest.weight

    goal = Column(Enum(FitnessGoalEnum))
    injuries = Column(String)
    training_experience = Column(Enum(TrainingLevelEnum))

    def default_macros():
        return {
        "protein": 0,
        "carbs": 0,
        "fats": 0,
        "calories": 0
    }

    #macro_defaults = Column(MutableDict.as_mutable(JSONB),server_default=text('{"protein": 0, "carbs": 0, "fats": 0, "calories": 0}'),default=default_macros)
    saved_wokrouts = relationship('SavedWorkouts',backref='owner',lazy = True,cascade="all, delete-orphan")


    prs = relationship('PRs',backref = 'author',lazy = True)

    workouts = relationship('Workouts',backref = 'author',lazy = True)

    friends = relationship('User',secondary = 'friendships',primaryjoin=(id == Friendships.user_id),secondaryjoin=(id == Friendships.friend_id),backref = 'added_by')

    fcm_token = Column(String, nullable=True)

    @property
    def all_friends(self):
        db = get_db()

        statement = select(Friendships).where(
            ((Friendships.user_id == self.id) & (Friendships.status == "accepted")) | 
            ((Friendships.friend_id == self.id) & (Friendships.status == "accepted"))
        )
        friends = db.execute(statement).scalars().all()
        
        Friends = []
        for f in friends:
            friend_id = f.friend_id

            friend = db.get(User, friend_id)
            if friend:
                Friends.append(friend)

        return Friends

class SavedWorkouts(Base):
    __tablename__ = "saved_wokrouts"

    workout_id = Column(Integer, ForeignKey('workouts.id', ondelete='CASCADE'), primary_key=True)
    owner_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'))

class PRs(Base):
    __tablename__ = "Personal records"

    id = Column(Integer,primary_key = True)

    weight = Column(Float)
    reps = Column(Integer)
    excersize_name = Column(String)
    logged_at = Column(DateTime(timezone=True), server_default=func.now())
    owner_id = Column(Integer,ForeignKey('users.id'),nullable = False)

class Weight(Base):
    __tablename__ = "weights"

    id = Column(Integer,primary_key=True)
    weight = Column(Float)
    logged_at = Column(DateTime(timezone=True), server_default=func.now())
    bodyfat_percentage = Column(Float)
    owner_id = Column(Integer,ForeignKey('users.id'),nullable = False)

    def get_rag_string_weight(self):
        date_str = self.logged_at.strftime("%B %d, %Y") if self.created_at else "Recent"
        
        summary = f"On {date_str}, the user logged a weight of {self.weight}kg at {self.bodyfat_percentage}percent bodyfat"
            
        return summary

class BlacklistedTokens(Base):
    __tablename__ = "token_blacklist"

    id = Column(Integer, primary_key=True)
    token = Column(String(500),unique = True,nullable = False)
    time_listing = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class Workouts(Base):
    __tablename__ = "workouts"

    id = Column(Integer, primary_key=True)
    type = Column(String, nullable=False)

    _excersizes = Column('excersizes', JSONB, default=list)
    
    duration_min = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    owner_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    notes = Column(String)

    saved_by_users = relationship('SavedWorkouts',cascade="all, delete-orphan",passive_deletes=True)

    @property
    def excersizes(self):
        if not self._excersizes:
            return []
        return [Excersize.from_db(item) for item in self._excersizes]

    @excersizes.setter
    def excersizes(self, value):
        if isinstance(value, list):
            self._excersizes = [ex.to_dict() for ex in value]
        else:
            current_list = list(self._excersizes) if self._excersizes else []
            current_list.append(value.to_dict())
            self._excersizes = current_list

    def get_rag_string(self):
        date_str = self.created_at.strftime("%B %d, %Y") if self.created_at else "Recent"
        
        summary = f"On {date_str}, the user completed a {self.duration_min} minute {self.type} workout with these additional notes about it {self.notes}."
        
        details = []
        for ex in self.excersizes:
            details.append(f"{ex.name}: {ex.sets}x{ex.reps} at {ex.weight}kg and additional description:{ex.desc}")
            
        return f"{summary} Exercises included: {', '.join(details)}."

class Excersize:
    def __init__(self, ex_name, reps, sets, weight, desc):
        self.ex_name = ex_name
        self.reps = reps
        self.sets = sets
        self.weight = weight
        self.desc = desc

    def to_dict(self):
        return {
            "name": self.ex_name,
            "reps": self.reps,
            "sets": self.sets,
            "weight": self.weight,
            "desc": self.desc
        }

    @classmethod
    def from_db(cls, data):
        return cls(
            ex_name=data.get("name"),
            reps=data.get("reps"),
            sets=data.get("sets"),
            weight=data.get("weight"),
            desc=data.get("desc") 
        )
