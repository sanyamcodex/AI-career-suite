from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from resume_parser import extract_text_from_file
from skill_extractor import extract_skills
from info_extractor import extract_contact_info, generate_feedback
from database import save_analysis, analysis_collection  # Dono ek saath import karein
import datetime
import os
from typing import List, Dict, Optional
import requests

# Optional: external LLM client for smarter chatbot
try:
    from openai import OpenAI

    _OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or None
   

    openai_client = OpenAI(api_key=_OPENAI_API_KEY) if _OPENAI_API_KEY else None
    print("LLM startup: key_found=", bool(_OPENAI_API_KEY), " client_created=", bool(openai_client))
except Exception:
    openai_client = None

app = FastAPI(title="AI Resume Analyzer API")

# --- 1. CORS SETUP (Humesha Routes se Pehle) ---
# During local dev we allow all origins so Vite dev server
# (5173/5174/…) can call FastAPI freely.
origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 2. HISTORY ENDPOINT ---
@app.get("/api/history")
async def get_history():
    try:
        history = []
        # Latest 10 records nikalte hain
        cursor = analysis_collection.find().sort("timestamp", -1).limit(10)
        for document in cursor:
            history.append({
                "id": str(document["_id"]),
                "filename": document["filename"],
                "email": document.get("email", "N/A"),
                "match_score": document["match_score"],
                "timestamp": document["timestamp"].strftime("%Y-%m-%d %H:%M")
            })
        return history
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database History Error: {str(e)}")

# --- 3. UPLOAD ENDPOINT ---
@app.post("/api/upload")
async def upload_resume(
    file: UploadFile = File(...),
    job_description: str = Form("")
):
    if not file.filename.lower().endswith(('.pdf', '.docx')):
        raise HTTPException(status_code=400, detail="Only PDF and DOCX supported.")
    
    file_bytes = await file.read()
    extracted_text = extract_text_from_file(file_bytes, file.filename)
    
    if not extracted_text:
        raise HTTPException(status_code=500, detail="Could not extract text.")
        
    resume_skills = extract_skills(extracted_text)
    contact_info = extract_contact_info(extracted_text)
    feedback = generate_feedback(extracted_text, contact_info, resume_skills)
    
    # --- SCORING LOGIC ---
    match_score = 0
    missing_skills = []
    has_jd = bool(job_description.strip())
    
    if has_jd:
        jd_skills = extract_skills(job_description)
        if len(jd_skills) > 0:
            matching_skills = set(resume_skills).intersection(set(jd_skills))
            missing_skills = list(set(jd_skills) - set(resume_skills))
            skill_score = (len(matching_skills) / len(jd_skills)) * 70

            bonus = 0
            if contact_info.get("email"): bonus += 5
            if contact_info.get("phone"): bonus += 5
            if "linkedin" in extracted_text.lower(): bonus += 10

            match_score = min(round(skill_score + bonus), 98)
    else:
        # Profile strength basis on skills count
        match_score = min(len(resume_skills) * 5, 85)

    # --- ROADMAP & INTERVIEW ---
    roadmap = []
    if any(s.lower() in ["react", "javascript"] for s in resume_skills):
        roadmap.append("Master Next.js & Server Components")
    if any(s.lower() in ["node.js", "express"] for s in resume_skills):
        roadmap.append("Learn Docker & Kubernetes for Deployment")
    if "C++" in resume_skills:
        roadmap.append("Advance to System Design & Low Level Design")
    
    if not roadmap:
        roadmap = ["Build 3 MERN Projects", "Solve 200+ LeetCode problems"]

    questions = [f"Tell me about a complex challenge you faced while working with {s}?" for s in resume_skills[:3]]

    # --- 4. ATS Keyword Gap Analyzer (Job Description vs Resume) ---
    keyword_gap = {
        "missing_keywords": missing_skills,
        "suggestions": [],
        "highlight_lines": []
    }
    if has_jd and missing_skills:
        lines = extracted_text.splitlines()
        lower_lines = [ln.lower() for ln in lines]
        for kw in missing_skills:
            suggestion_text = ""
            kw_lower = kw.lower()
            if any(token in kw_lower for token in ["react", "javascript", "frontend"]):
                suggestion_text = f"Add '{kw}' inside your Projects or Skills section, ideally in a bullet describing a UI feature you built."
            elif any(token in kw_lower for token in ["node", "api", "express", "backend", "rest"]):
                suggestion_text = f"Mention '{kw}' under Experience/Projects where you describe backend APIs or services."
            elif any(token in kw_lower for token in ["docker", "kubernetes", "aws", "ci/cd", "pipeline"]):
                suggestion_text = f"Include '{kw}' in a bullet that talks about deployment, DevOps or cloud work."
            else:
                suggestion_text = f"Include '{kw}' either in your Skills list or under a relevant project bullet."

            keyword_gap["suggestions"].append({
                "keyword": kw,
                "suggestion": suggestion_text
            })

            # Try to find 1–2 lines where this keyword would naturally fit
            anchor_indices: List[int] = []
            for i, ln in enumerate(lower_lines):
                if any(h in ln for h in ["experience", "project", "projects", "skills"]):
                    anchor_indices.append(i)
            for idx in anchor_indices[:2]:
                keyword_gap["highlight_lines"].append({
                    "keyword": kw,
                    "line_number": idx + 1,
                    "text": lines[idx]
                })

    # --- 5. Section-wise scoring (Experience / Education / Projects / Skills / Formatting) ---
    tl = extracted_text.lower()
    def has_section(name: str) -> bool:
        return name in tl

    def density_score(keyword: str) -> int:
        count = tl.count(keyword)
        if count == 0:
            return 20
        if count == 1:
            return 55
        if count == 2:
            return 70
        if count >= 3:
            return 85
        return 60

    skills_match_score = min(100, max(40, len(resume_skills) * 4))
    experience_match = density_score("experience")
    education_match = density_score("education")
    projects_match = density_score("project")

    # simple formatting heuristics
    bullet_chars = ["•", "-", "–", "*"]
    has_bullets = any(ch in extracted_text for ch in bullet_chars)
    line_lengths = [len(l) for l in extracted_text.splitlines() if l.strip()]
    avg_len = sum(line_lengths) / len(line_lengths) if line_lengths else 80
    formatting_score = 90
    if not has_bullets:
        formatting_score -= 10
    if avg_len > 140:
        formatting_score -= 10
    formatting_score = max(60, min(100, formatting_score))

    section_scores = {
        "ats_score": match_score,
        "skills_match": round(skills_match_score),
        "experience_match": round(experience_match),
        "education_match": round(education_match),
        "projects_match": round(projects_match),
        "formatting_score": round(formatting_score),
    }

    # --- 6. AI-ish line-by-line suggestions (template-based, more variety) ---
    line_suggestions: List[Dict[str, str]] = []
    lines = [ln for ln in extracted_text.splitlines() if ln.strip()]
    weak_starts = ["worked on", "did", "helped", "responsible for", "made", "created"]
    strong_verbs = ["Developed", "Implemented", "Optimized", "Built", "Led", "Designed"]

    def is_heading(l: str) -> bool:
        stripped = l.strip()
        if len(stripped.split()) <= 3 and stripped.isupper():
            return True
        if stripped.endswith(":") and len(stripped.split()) <= 4:
            return True
        return False

    for idx, ln in enumerate(lines):
        lower_ln = ln.lower().strip()
        if is_heading(ln):
            continue

        # Only touch short / weak lines
        if not (any(lower_ln.startswith(ws) for ws in weak_starts) or (len(ln) < 80 and len(ln.split()) >= 3)):
            continue

        verb = strong_verbs[idx % len(strong_verbs)]

        # Try to pick a related skill for this line
        related_skill = ""
        for s in resume_skills:
            if s.lower().split()[0] in lower_ln:
                related_skill = s
                break
        if not related_skill and resume_skills:
            related_skill = resume_skills[idx % len(resume_skills)]

        improved = ""
        # Link / online profile lines
        if any(k in lower_ln for k in ["linkedin", "github", "portfolio"]):
            improved = (
                f"{verb} a professional online presence by curating projects on LinkedIn / GitHub and "
                f"highlighting impact, metrics and tech stack for each project."
            )
        # Tool / tech stack lists
        elif ":" in ln and any(k in lower_ln for k in ["tools", "tech", "stack", "backend", "frontend", "database"]):
            label, rest = ln.split(":", 1)
            improved = (
                f"{verb} and standardized the {label.strip().lower()} using {rest.strip()}, "
                f"reducing setup time and improving team productivity."
            )
        # Education style lines
        elif any(k in lower_ln for k in ["university", "college", "b.tech", "btech", "bachelor", "masters"]):
            improved = (
                f"Completed {ln.strip().rstrip('.')} with a focus on practical projects, hackathons and "
                f"coursework aligned to {related_skill or 'software development'}."
            )
        # Generic experience / project line
        else:
            improved = (
                f"{verb} {related_skill or 'a production-ready feature'} — {ln.strip().rstrip('.')} and "
                f"delivered measurable results (e.g. faster performance, higher reliability or better UX)."
            )

        line_suggestions.append({
            "original": ln.strip(),
            "improved": improved
        })

        if len(line_suggestions) >= 8:
            break

    improved_resume_text = "\n".join(
        s["improved"] for s in line_suggestions
    ) if line_suggestions else extracted_text

    # --- 7. Job role match prediction ---
    ROLE_SKILLS: Dict[str, List[str]] = {
        "Frontend Developer": ["react", "javascript", "html", "css", "tailwind", "redux", "next.js"],
        "Backend Developer": ["node.js", "express", "rest api", "mongodb", "mysql", "postgresql", "docker"],
        "AI Engineer": ["python", "machine learning", "nlp", "deep learning"],
        "Data Analyst": ["sql", "python", "excel", "data analysis"],
    }

    lower_resume_skills = [s.lower() for s in resume_skills]
    role_match = []
    for role, expected in ROLE_SKILLS.items():
        if not expected:
            score = 0
        else:
            matches = len([s for s in expected if s in lower_resume_skills])
            score = int((matches / len(expected)) * 100)
        role_match.append({"role": role, "score": score})

    # --- COVER LETTER & RED FLAGS ---
    first_name = contact_info.get("email", "Candidate").split('@')[0].capitalize()
    cover_letter = f"Dear Hiring Manager,\n\nI am excited to apply for this role. My skills in {', '.join(resume_skills[:3])} make me a strong fit..."
    
    red_flags = []
    if not contact_info.get("phone"): red_flags.append("No phone number found.")
    if "gmail.com" not in contact_info.get("email", ""): red_flags.append("Check if email is professional.")

    # --- DATABASE SAVE LOGIC ---
    analysis_data = {
        "filename": file.filename,
        "email": contact_info.get("email"),
        "match_score": match_score,
        "skills": resume_skills,
        "timestamp": datetime.datetime.now()
    }
    
    await save_analysis(analysis_data)

    return {
        "filename": file.filename,
        "contact_info": contact_info,
        "feedback": feedback,
        "resume_skills": resume_skills,
        "match_score": match_score,
        "missing_skills": missing_skills,
        "roadmap": roadmap,
        "questions": questions,
        "cover_letter": cover_letter,
        "red_flags": red_flags,
        "has_jd": has_jd,
        "keyword_gap": keyword_gap,
        "section_scores": section_scores,
        "line_suggestions": line_suggestions,
        "improved_resume": improved_resume_text,
        "role_match": role_match,
        "message": "Analysis successful and saved to DB"
    }


# --- 8. Simple AI Mock Interview endpoints ---

INTERVIEW_QUESTION_BANK: Dict[str, List[str]] = {
    "frontend": [
        "Explain the Virtual DOM in React.",
        "What are React hooks? Name a few.",
        "How would you optimize performance in a large React application?"
    ],
    "backend": [
        "Explain what a REST API is.",
        "How does authentication differ from authorization?",
        "What is connection pooling in databases?"
    ],
    "ai": [
        "Explain the difference between supervised and unsupervised learning.",
        "What is overfitting and how do you avoid it?",
        "Describe the bias-variance tradeoff."
    ],
    "dsa": [
        "What is the time complexity of quicksort in average and worst case?",
        "Explain the difference between a stack and a queue.",
        "What is a hash table and when would you use it?"
    ]
}


@app.get("/api/mock/questions")
async def get_mock_questions(role: str = "frontend"):
    role = role.lower()
    key = "frontend"
    if "back" in role:
        key = "backend"
    elif "ai" in role or "ml" in role:
        key = "ai"
    elif "dsa" in role or "algo" in role:
        key = "dsa"

    return {
        "role": key,
        "questions": INTERVIEW_QUESTION_BANK.get(key, INTERVIEW_QUESTION_BANK["frontend"])
    }


@app.post("/api/mock/evaluate")
async def evaluate_answer(question: str = Form(...), answer: str = Form(...)):
    """
    Extremely lightweight scoring: just checks length + few keyword hits
    to give a 1–10 score and friendly feedback.
    """
    if not answer.strip():
        return {"score": 0, "feedback": "Try writing a detailed answer so I can evaluate it."}

    ans_lower = answer.lower()
    length = len(answer.split())
    score = 5

    if length > 40:
        score += 2
    if length > 80:
        score += 1

    # simple keyword boosts
    boosts = 0
    for kw in ["time complexity", "big o", "space complexity", "tradeoff", "example", "edge case"]:
        if kw in ans_lower:
            boosts += 1
    score += min(3, boosts)

    score = max(1, min(10, score))

    feedback_parts = []
    if length < 40:
        feedback_parts.append("Add more depth and real examples; your answer is a bit short.")
    if "example" not in ans_lower:
        feedback_parts.append("Include at least one concrete example to make it stronger.")
    if "time complexity" in question.lower() and "o(" not in ans_lower:
        feedback_parts.append("Mention the actual Big-O notation to score full marks.")

    if not feedback_parts:
        feedback_parts.append("Great answer! You covered the key points with enough detail.")

    return {
        "score": score,
        "feedback": " ".join(feedback_parts)
    }


# --- 9. AI Chatbot endpoint (LLM with rule-based fallback) ---


def call_ollama_chat(message: str) -> Optional[str]:
    """
    Ollama is not available in most cloud deployments (like Hugging Face Spaces).
    This function safely disables Ollama chat and returns None.
    """
    print("Ollama is disabled in this environment.")
    return None

@app.post("/api/chat")
async def chat_agent(message: str = Form(...)):
    """
    Prefer local Ollama model if available; otherwise try OpenAI;
    if both fail, fall back to a rule-based mini-assistant.
    """
    msg_raw = message.strip()
    msg = msg_raw.lower()

    if not msg:
        return {"reply": "Ask me anything about ATS, resume improvement, interview prep, or which role suits you."}

    # 1) Try local Ollama first (no external API needed)
    ollama_reply = call_ollama_chat(msg_raw)
    if ollama_reply:
        return {"reply": ollama_reply}

    # 2) If we have an OpenAI client, try that as a backup
    if openai_client:
        try:
            completion = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a helpful, general-purpose AI assistant integrated into a web app. "
                            "Answer the user's questions as clearly and usefully as possible. "
                            "If they ask about resumes, ATS, careers or interviews, give focused, practical guidance. "
                            "Otherwise, behave like a normal ChatGPT-style assistant and answer normally."
                        ),
                    },
                    {"role": "user", "content": msg_raw},
                ],
                temperature=0.6,
            )
            reply = completion.choices[0].message.content.strip()
            return {"reply": reply}
        except Exception as e:
            # fall through to rule-based reply if LLM fails
            print("LLM chat error:", e)

    # --- Rule-based fallback (improved) ---
    parts: List[str] = []

    if "how are you" in msg or "kaise ho" in msg:
        parts.append(
            "I’m doing great and ready to help with your resume. Let’s focus on your ATS score, missing skills, or interview prep."
        )

    if "resume" in msg and ("lack" in msg or "lacks" in msg or "weak" in msg or "improve" in msg or "stand out" in msg or "standout" in msg):
        parts.append(
            "Common gaps are: (1) missing standard sections like Projects or Skills, "
            "(2) no numbers or impact in bullets, and (3) missing keywords from the job description."
        )
        parts.append(
            "Run an analysis and look at: the ATS Keyword Gap block, Section scores, and AI Resume Fix Suggestions — "
            "they tell you exactly which skills, sections and lines are weak."
        )

    if "ats" in msg or "score" in msg:
        parts.append(
            "Your ATS score mainly depends on skills match with the job description, "
            "clear sections (Experience / Education / Projects / Skills) and clean formatting (bullets, consistency)."
        )
    if "keyword" in msg or "missing" in msg:
        parts.append(
            "Use the ATS Keyword Gap block on the right – it lists missing keywords and suggests exactly where "
            "to add them (Skills, Projects or Experience bullets)."
        )
    if "credits" in msg or "premium" in msg:
        parts.append(
            "New users start with 100 credits and each analysis costs 5 credits. "
            "Once credits reach 0, you can activate Premium from the left panel to continue unlimited analyses."
        )
    if "interview" in msg or "mock" in msg:
        parts.append(
            "Open the AI Mock Interview section on the right, pick a role (Frontend / Backend / AI / DSA), "
            "then answer a question – you’ll get a 1–10 score and feedback."
        )
    if "improve" in msg or "rewrite" in msg or "fix" in msg:
        parts.append(
            "Focus on strong action verbs, numbers and impact. The AI Resume Fix Suggestions panel shows before/after lines, "
            "and the AI Resume Rewriter collects improved bullets you can paste back into your CV."
        )

    if not parts:
        parts.append(
            "I’m a built-in assistant. Try asking about: ATS score, missing keywords, credits & premium, "
            "mock interview, or paste one of your resume lines and say 'rewrite this'."
        )

    return {"reply": " ".join(parts)}
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=7860
    )