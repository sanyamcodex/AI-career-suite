# ai-resume-analyzer/ml-service/resume_parser.py
import io
import PyPDF2
import docx

def extract_text_from_file(file_bytes, filename):
    text = ""
    try:
        if filename.lower().endswith('.pdf'):
            pdf_file = io.BytesIO(file_bytes)
            pdf_reader = PyPDF2.PdfReader(pdf_file)
            
            # 1. Normal text extract karo
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
                
                # 2. Chupe hue clickable links dhoondho (Annotations)
                if "/Annots" in page:
                    for annot in page["/Annots"]:
                        subtype = annot.get_object().get("/Subtype")
                        if subtype == "/Link":
                            uri_obj = annot.get_object().get("/A")
                            if uri_obj and "/URI" in uri_obj:
                                text += " " + uri_obj["/URI"] # Link text mein add kar do
        
        elif filename.lower().endswith('.docx'):
            doc = docx.Document(io.BytesIO(file_bytes))
            for para in doc.paragraphs:
                text += para.text + "\n"
                
    except Exception as e:
        print(f"Error: {e}")
        return None
        
    return text.strip()