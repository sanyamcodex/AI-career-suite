# ai-resume-analyzer/ml-service/info_extractor.py
import re

def extract_contact_info(text):
    """
    Uses Regex to find email and phone numbers in the resume.
    """
    # Standard Regex pattern for emails
    email_pattern = r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+'
    emails = re.findall(email_pattern, text)
    
    # Standard Regex for phone numbers (handles various formats like +91, dashes, etc.)
    phone_pattern = r'\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b'
    phones = re.findall(phone_pattern, text)
    
    return {
        "email": emails[0] if emails else None,
        "phone": phones[0] if phones else None
    }

def generate_feedback(text, contact_info, skills):
    feedback = []
    text_lower = text.lower()
    
    # 1. Standard Sections Check
    sections = ["experience", "education", "projects", "skills"]
    for section in sections:
        if section not in text_lower:
            feedback.append(f"❌ Missing Section: Your resume is missing '{section.title()}'. This is mandatory for 90+ ATS score.")

    # 2. LinkedIn Check (Professional requirement)
    if "linkedin.com" not in text_lower:
        feedback.append("⚠️ Missing LinkedIn: Add your LinkedIn profile link to increase trust.")

    # 3. Action Verbs Check
    action_verbs = ["developed", "managed", "implemented", "created", "led", "optimized"]
    verb_found = any(verb in text_lower for verb in action_verbs)
    if not verb_found:
        feedback.append("💡 Tip: Use strong action verbs like 'Optimized' or 'Implemented' to describe your work.")

    return feedback