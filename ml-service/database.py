from motor.motor_asyncio import AsyncIOMotorClient

# Local MongoDB connection URL
MONGODB_URL = "mongodb://localhost:27017"

client = AsyncIOMotorClient(MONGODB_URL)
database = client.resume_analyzer_db
analysis_collection = database.get_collection("analysis_history")

async def save_analysis(data):
    """Result ko database mein save karne ke liye function"""
    try:
        result = await analysis_collection.insert_one(data)
        return str(result.inserted_id)
    except Exception as e:
        print(f"DB Error: {e}")
        return None