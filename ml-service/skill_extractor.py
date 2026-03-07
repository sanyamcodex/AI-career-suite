# ai-resume-analyzer/ml-service/skill_extractor.py
import spacy

# Load the English NLP model
nlp = spacy.load("en_core_web_sm")

# A sample database of skills to look for. 
# You can expand this list later with hundreds of skills!
KNOWN_SKILLS = [
    # Programming
    "python", "java", "c++", "javascript", "typescript", "sql", "c",
    # Frontend
    "react", "html", "css", "tailwind", "bootstrap", "redux", "next.js",
    # Backend & DB
    "node.js", "express", "mongodb", "mysql", "postgresql", "rest api", "fastapi",
    # Tools & DevOps
    "git", "github", "docker", "aws", "postman", "vscode", "firebase",
    # CS Concepts
    "data structures", "algorithms", "oops", "dbms", "operating systems",
    "machine learning", "nlp", "artificial intelligence"
]

def extract_skills(text):
    """
    Takes resume text, processes it with NLP, and returns a list of found skills.
    """
    # Convert text to lowercase for easier matching
    text = text.lower()
    
    # Let spaCy process the text
    doc = nlp(text)
    
    found_skills = set()
    
    # Simple Keyword Matching: Check if any known skill is in the text
    for skill in KNOWN_SKILLS:
        if skill in text:
            found_skills.add(skill.title()) # .title() makes "c++" -> "C++", "react" -> "React"
            
    # You can also use spaCy's advanced features here later 
    # (like finding noun phrases), but keyword matching is best for ATS!
    
    return list(found_skills)