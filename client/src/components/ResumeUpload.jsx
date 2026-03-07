import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import html2pdf from 'html2pdf.js';
import './ResumeUpload.css';

const ResumeUpload = () => {
  const API_BASE = useMemo(() => 'http://localhost:5000', []);

  // --- STATES ---
  const [file, setFile] = useState(null);
  const [jobDescription, setJobDescription] = useState('');
  const [status, setStatus] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // --- Mock interview ---
  const [mockQuestions, setMockQuestions] = useState([]);
  const [mockRole, setMockRole] = useState('frontend');
  const [selectedQuestion, setSelectedQuestion] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [answerResult, setAnswerResult] = useState(null);

  // --- Chatbot ---
  const [chatMessages, setChatMessages] = useState([
    { from: 'bot', text: 'Hi! Ask me anything about ATS, credits, premium, interview prep, or how to improve your resume.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatSending, setIsChatSending] = useState(false);

  // --- AUTH / CREDITS ---
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(() => localStorage.getItem('token') || '');
  const [me, setMe] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const isLoggedIn = Boolean(token);
  const credits = me?.credits ?? null;
  const isPremium = Boolean(me?.isPremium && me?.premiumUntil && new Date(me.premiumUntil) > new Date());

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const loadMe = async (t = token) => {
    if (!t) return;
    const res = await axios.get(`${API_BASE}/api/me`, { headers: { Authorization: `Bearer ${t}` } });
    setMe(res.data.user);
  };

  useEffect(() => {
    if (token) {
      loadMe().catch(() => {
        // token invalid/expired
        localStorage.removeItem('token');
        setToken('');
        setMe(null);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- FUNCTIONS ---
  const handleAuth = async () => {
    setIsAuthLoading(true);
    setStatus('');
    try {
      if (authMode === 'signup') {
        const res = await axios.post(`${API_BASE}/api/auth/signup`, { name, email, password });
        const t = res.data.token;
        localStorage.setItem('token', t);
        setToken(t);
        setMe(res.data.user);
        setStatus('Account created. 100 credits added.');
      } else {
        const res = await axios.post(`${API_BASE}/api/auth/login`, { email, password });
        const t = res.data.token;
        localStorage.setItem('token', t);
        setToken(t);
        setMe(res.data.user);
        setStatus('Logged in successfully.');
      }
    } catch (e) {
      setStatus(e?.response?.data?.message || e?.response?.data?.msg || 'Auth failed.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setMe(null);
    setAnalysisResult(null);
    setStatus('Logged out.');
  };

  const upgradeToPremium = async () => {
    if (!token) return;
    setStatus('Activating premium...');
    try {
      const res = await axios.post(`${API_BASE}/api/billing/upgrade`, { months: 1 }, { headers: authHeaders });
      setMe(res.data.user);
      setStatus('Premium activated.');
    } catch (e) {
      setStatus(e?.response?.data?.message || 'Upgrade failed.');
    }
  };

  const handleUpload = async () => {
    if (!token) { setStatus('Please login first.'); return; }
    if (!file) { setStatus('Select a file first!'); return; }
    setIsUploading(true); 
    setStatus('AI is analyzing your profile...');
    setAnalysisResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('job_description', jobDescription);

    try {
     const response = await axios.post(`${API_BASE}/api/analyze`, formData, {
        headers: { ...authHeaders, 'Content-Type': 'multipart/form-data' }
     });
      setAnalysisResult(response.data.analysis);
      if (typeof response.data.credits === 'number') {
        setMe((prev) => prev ? { ...prev, credits: response.data.credits } : prev);
      }
      setStatus('Analysis Complete!');
    } catch (e) {
      if (e?.response?.status === 402 && e?.response?.data?.code === 'INSUFFICIENT_CREDITS') {
        setStatus('Credits finished. Please buy premium subscription.');
      } else if (e?.response?.status === 401) {
        setStatus('Session expired. Please login again.');
        handleLogout();
      } else {
        setStatus(e?.response?.data?.message || 'Connection failed! Make sure backend is running.');
      }
    } finally {
      setIsUploading(false);
    }
  };

const fetchHistory = async () => {
  const res = await axios.get('http://127.0.0.1:8000/api/history');
  setHistory(res.data);
  setShowHistory(true);
};

  const downloadPDF = () => {
    const element = document.getElementById('analysis-result-box');
    const opt = {
      margin: 0.3,
      filename: `ATS_Report_${analysisResult?.filename || 'Resume'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().from(element).set(opt).save();
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Cover letter copied!');
  };

  const fetchMockQuestions = async (roleKey) => {
    try {
      const res = await axios.get('http://127.0.0.1:8000/api/mock/questions', { params: { role: roleKey } });
      setMockQuestions(res.data.questions || []);
      setMockRole(res.data.role || roleKey);
      setSelectedQuestion(res.data.questions?.[0] || '');
      setAnswerText('');
      setAnswerResult(null);
    } catch (e) {
      setStatus('Unable to load interview questions.');
    }
  };

  const evaluateAnswer = async () => {
    if (!selectedQuestion || !answerText.trim()) return;
    try {
      const form = new FormData();
      form.append('question', selectedQuestion);
      form.append('answer', answerText);
      const res = await axios.post('http://127.0.0.1:8000/api/mock/evaluate', form);
      setAnswerResult(res.data);
    } catch (e) {
      setStatus('Evaluation failed.');
    }
  };

  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || isChatSending) return;
    setChatInput('');
    setChatMessages((prev) => [...prev, { from: 'user', text: msg }]);
    setIsChatSending(true);
    try {
      const form = new FormData();
      form.append('message', msg);
      const res = await axios.post('http://127.0.0.1:8000/api/chat', form);
      const reply = res.data?.reply || 'Sorry, I could not generate a response.';
      setChatMessages((prev) => [...prev, { from: 'bot', text: reply }]);
    } catch {
      setChatMessages((prev) => [...prev, { from: 'bot', text: 'Chat service is not available right now.' }]);
    } finally {
      setIsChatSending(false);
    }
  };

  return (
    <div className="ra-shell">
      <div className="ra-topbar">
        <div className="ra-brand">
          <h1>AI Career Suite</h1>
          <p>ATS Resume Analyzer</p>
        </div>

        <div className="ra-actions">
          {isLoggedIn ? (
            <>
              <span className="pill">Signed in: <b>{me?.email || '...'}</b></span>
              <span className={`pill ${isPremium ? 'pill--premium' : ''}`}>
                Credits: <b>{credits ?? '...'}</b>{isPremium ? ' • Premium' : ''}
              </span>
              <button className="btn" onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <span className="pill">Welcome — please login</span>
          )}
        </div>
      </div>

      <div className="ra-main">
        {/* LEFT: Sticky AI chatbot */}
        <div className="ra-chat">
          <div className="chat-card">
            <div className="chat-header">
              <h2>AI Assistant</h2>
              <p>Ask about ATS score, missing skills, resume improvement, or interview prep.</p>
              <div className="chat-suggestions">
                <button
                  className="chip-btn"
                  type="button"
                  onClick={() => setChatInput('What skills does my resume lack?')}
                >
                  Skills gap
                </button>
                <button
                  className="chip-btn"
                  type="button"
                  onClick={() => setChatInput('Rewrite this resume line: ')}
                >
                  Rewrite a line
                </button>
                <button
                  className="chip-btn"
                  type="button"
                  onClick={() => setChatInput('Suggest some interview questions for frontend developer.')}
                >
                  Interview help
                </button>
              </div>
            </div>
            <div className="chat-messages">
              {chatMessages.map((m, idx) => (
                <div key={idx} className={`chat-msg ${m.from}`}>
                  <div className="chat-msg-label">
                    {m.from === 'user' ? 'You' : 'Assistant'}
                  </div>
                  <div className="chat-msg-bubble">
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="chat-inputRow">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type your question..."
                onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
              />
              <button className="btn btn-primary" onClick={sendChat} disabled={isChatSending || !chatInput.trim()}>
                Send
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Auth / Upload / Results (scrollable) */}
        <div className="ra-mainContent">
          <div className="ra-grid">
        {/* Left: Auth / Upload */}
        <div className="card">
          {!isLoggedIn ? (
            <>
              <h2>{authMode === 'signup' ? 'Create account' : 'Login'}</h2>
              <p className="sub">
                Sign in to get <b>100 credits</b>. Each resume analysis costs <b>5 credits</b>. Premium users can analyze without credits.
              </p>

              {authMode === 'signup' && (
                <div className="field">
                  <div className="label">Name</div>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                </div>
              )}

              <div className="field">
                <div className="label">Email</div>
                <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>

              <div className="field">
                <div className="label">Password</div>
                <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" type="password" />
              </div>

              <button
                className="btn btn-primary"
                onClick={handleAuth}
                disabled={isAuthLoading || !email || !password || (authMode === 'signup' && !name)}
              >
                {isAuthLoading ? 'Please wait…' : (authMode === 'signup' ? 'Sign up (Get 100 credits)' : 'Login')}
              </button>

              <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
                <button className="btn mutedBtn" onClick={() => setAuthMode(authMode === 'signup' ? 'login' : 'signup')}>
                  {authMode === 'signup' ? 'Already have an account? Login' : 'New here? Create account'}
                </button>
              </div>

              {status ? <div className="status">{status}</div> : null}
            </>
          ) : (
            <>
              <h2>Upload resume</h2>
              <p className="sub">Upload a PDF/DOCX and optionally paste the job description to get ATS match score, roadmap, and cover letter.</p>

              <div className="field">
                <div className="label">Resume file</div>
                <input className="file" type="file" accept=".pdf,.docx" onChange={(e) => setFile(e.target.files[0])} />
              </div>

              <div className="field">
                <div className="label">Job description (optional)</div>
                <textarea className="textarea" placeholder="Paste job description…" value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} />
              </div>

              <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={isUploading || !file || (!isPremium && credits === 0)}
              >
                {isUploading ? 'Analyzing…' : 'Analyze resume'}
              </button>

              <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn mutedBtn" onClick={fetchHistory}>View history</button>
                {!isPremium && credits === 0 ? (
                  <button className="btn btn-dark" onClick={upgradeToPremium}>Go Premium</button>
                ) : null}
              </div>

              {!isPremium && credits === 0 ? (
                <div className="notice">
                  <strong>Credits finished.</strong>
                  Buy premium subscription to continue analyzing.
                </div>
              ) : null}

              {status ? <div className="status">{status}</div> : null}
            </>
          )}
        </div>

        {/* Right: Results / History */}
        <div className="card">
          {!isLoggedIn ? (
            <>
              <h2>What you’ll get</h2>
              <p className="sub">Clean report experience: ATS score, skills, roadmap, interview questions and cover letter — exportable as PDF.</p>
              <div className="twoCol">
                <div className="mini">
                  <h3>ATS match score</h3>
                  <p>Instant match score with missing skills guidance.</p>
                </div>
                <div className="mini">
                  <h3>AI roadmap</h3>
                  <p>Next learning steps based on your resume skills.</p>
                </div>
              </div>
              <div style={{ height: 12 }} />
              <div className="twoCol">
                <div className="mini">
                  <h3>Interview prep</h3>
                  <p>Smart questions to practice for your top skills.</p>
                </div>
                <div className="mini">
                  <h3>Cover letter</h3>
                  <p>One-click copy + PDF download for sharing.</p>
                </div>
              </div>
            </>
          ) : (
            <>
              {showHistory && (
                <div className="mini" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <h3 style={{ margin: 0 }}>Recent analyses</h3>
                    <button className="btn" onClick={() => setShowHistory(false)}>Close</button>
                  </div>
                  <div style={{ height: 10 }} />
                  <table className="historyTable">
                    <thead>
                      <tr>
                        <th>File</th>
                        <th>Score</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((item) => (
                        <tr key={item.id}>
                          <td>{item.filename}</td>
                          <td style={{ fontWeight: 900, color: item.match_score > 70 ? 'var(--success)' : 'var(--danger)' }}>
                            {item.match_score}%
                          </td>
                          <td style={{ color: 'var(--muted)' }}>{item.timestamp}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {analysisResult ? (
                <div id="analysis-result-box" className="result">
                  <div className="resultHeader">
                    <div className="score">
                      <div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 700 }}>ATS Match Score</div>
                      <div className="big" style={{ color: analysisResult.match_score > 70 ? 'var(--success)' : 'var(--danger)' }}>
                        {analysisResult.match_score}%
                      </div>
                      <span className={`badge ${analysisResult.match_score > 70 ? 'good' : 'warn'}`}>
                        {analysisResult.match_score > 70 ? 'Strong profile' : 'Needs optimization'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span className="badge">Email: <b style={{ color: 'var(--text)' }}>{analysisResult.contact_info.email || 'N/A'}</b></span>
                      <span className="badge">Phone: <b style={{ color: 'var(--text)' }}>{analysisResult.contact_info.phone || 'N/A'}</b></span>
                    </div>
                  </div>

                  {/* Section-wise scores */}
                  {analysisResult.section_scores && (
                    <div className="mini" style={{ marginBottom: 12 }}>
                      <h3>Section scores</h3>
                      {Object.entries(analysisResult.section_scores).map(([k, v]) => (
                        <div key={k} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                            <span style={{ textTransform: 'capitalize' }}>{k.replace('_', ' ')}</span>
                            <span>{v}%</span>
                          </div>
                          <div style={{ width: '100%', height: 6, borderRadius: 999, background: 'rgba(15,23,42,0.9)' }}>
                            <div style={{
                              width: `${v}%`,
                              height: '100%',
                              borderRadius: 999,
                              background: v >= 80 ? 'var(--success)' : v >= 60 ? 'var(--warning)' : 'var(--danger)'
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="twoCol" style={{ marginBottom: 12 }}>
                    <div className="mini">
                      <h3>AI Roadmap</h3>
                      <ul>
                        {analysisResult.roadmap?.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                    <div className="mini">
                      <h3>Interview prep</h3>
                      {analysisResult.questions?.map((q, i) => (
                        <p key={i} style={{ borderLeft: '3px solid rgba(79,70,229,0.75)', paddingLeft: 10 }}>{q}</p>
                      ))}
                    </div>
                  </div>

                  {/* ATS Keyword Gap Analyzer */}
                  {analysisResult.keyword_gap && analysisResult.keyword_gap.missing_keywords?.length > 0 && (
                    <div className="mini" style={{ marginBottom: 12 }}>
                      <h3>ATS Keyword Gap</h3>
                      <p style={{ fontSize: 12, marginBottom: 6 }}>Missing from your resume (based on job description):</p>
                      <ul style={{ paddingLeft: 18, fontSize: 12 }}>
                        {analysisResult.keyword_gap.missing_keywords.map((kw) => (
                          <li key={kw}>❌ {kw}</li>
                        ))}
                      </ul>
                      {analysisResult.keyword_gap.suggestions?.length > 0 && (
                        <>
                          <p style={{ fontSize: 12, margin: '8px 0 4px' }}>Where to add them:</p>
                          <ul style={{ paddingLeft: 18, fontSize: 12 }}>
                            {analysisResult.keyword_gap.suggestions.map((s) => (
                              <li key={s.keyword}><b>{s.keyword}:</b> {s.suggestion}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}

                  {/* Line-by-line suggestions */}
                  {analysisResult.line_suggestions?.length > 0 && (
                    <div className="mini" style={{ marginBottom: 12 }}>
                      <h3>AI resume fix suggestions</h3>
                      {analysisResult.line_suggestions.map((sug, idx) => (
                        <div key={idx} style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, color: 'var(--muted-2)' }}>Bad:</div>
                          <div style={{ fontSize: 12, marginBottom: 4 }}>❌ {sug.original}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted-2)' }}>Improved:</div>
                          <div style={{ fontSize: 12 }}>✅ {sug.improved}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Improved resume rewriter */}
                  {analysisResult.improved_resume && (
                    <div className="mini" style={{ marginBottom: 12 }}>
                      <h3>AI resume rewriter</h3>
                      <p style={{ fontSize: 12, marginBottom: 6 }}>Preview of improved bullet points generated from your resume:</p>
                      <p style={{ whiteSpace: 'pre-line', fontSize: 12, maxHeight: 180, overflowY: 'auto' }}>
                        {analysisResult.improved_resume}
                      </p>
                    </div>
                  )}

                  {/* Job role match prediction */}
                  {analysisResult.role_match?.length > 0 && (
                    <div className="mini" style={{ marginBottom: 12 }}>
                      <h3>Job role match</h3>
                      <table className="historyTable">
                        <thead>
                          <tr>
                            <th>Role</th>
                            <th>Match</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysisResult.role_match.map((r) => (
                            <tr key={r.role}>
                              <td>{r.role}</td>
                              <td style={{ fontWeight: 900, color: r.score >= 80 ? 'var(--success)' : r.score >= 60 ? 'var(--warning)' : 'var(--danger)' }}>
                                {r.score}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* AI Mock Interview */}
                  <div className="mini" style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <h3 style={{ margin: 0 }}>AI Mock Interview</h3>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn" onClick={() => fetchMockQuestions('frontend')}>Frontend</button>
                        <button className="btn" onClick={() => fetchMockQuestions('backend')}>Backend</button>
                        <button className="btn" onClick={() => fetchMockQuestions('ai')}>AI</button>
                        <button className="btn" onClick={() => fetchMockQuestions('dsa')}>DSA</button>
                      </div>
                    </div>
                    {mockQuestions.length > 0 && (
                      <>
                        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                          Role: <b>{mockRole}</b>
                        </div>
                        <div className="field" style={{ marginTop: 8 }}>
                          <div className="label">Question</div>
                          <select
                            className="input"
                            value={selectedQuestion}
                            onChange={(e) => { setSelectedQuestion(e.target.value); setAnswerResult(null); }}
                          >
                            {mockQuestions.map((q, idx) => (
                              <option key={idx} value={q}>{q}</option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <div className="label">Your answer</div>
                          <textarea
                            className="textarea"
                            placeholder="Type your answer here..."
                            value={answerText}
                            onChange={(e) => setAnswerText(e.target.value)}
                          />
                        </div>
                        <button className="btn btn-primary" onClick={evaluateAnswer}>Get feedback</button>
                        {answerResult && (
                          <div className="status" style={{ marginTop: 8 }}>
                            Answer Score: <b>{answerResult.score}/10</b>
                            <br />
                            {answerResult.feedback}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="mini" style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <h3 style={{ margin: 0 }}>AI cover letter</h3>
                      <button className="btn" onClick={() => copyToClipboard(analysisResult.cover_letter)}>Copy</button>
                    </div>
                    <div style={{ height: 10 }} />
                    <p style={{ whiteSpace: 'pre-line' }}>{analysisResult.cover_letter}</p>
                  </div>

                  <div className="mini" style={{ marginBottom: 12 }}>
                    <h3>Skills</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {analysisResult.resume_skills?.map((s, i) => (
                        <span key={i} className="badge">{s}</span>
                      ))}
                    </div>
                  </div>

                  <button className="btn btn-dark" onClick={downloadPDF}>Download PDF report</button>
                </div>
              ) : (
                <>
                  <h2>Ready when you are</h2>
                  <p className="sub">Upload a resume from the left panel to generate your report here.</p>
                  <div className="twoCol">
                    <div className="mini">
                      <h3>Tip</h3>
                      <p>Paste a job description for better ATS match accuracy.</p>
                    </div>
                    <div className="mini">
                      <h3>Credits</h3>
                      <p>Each analysis costs 5 credits unless you’re Premium.</p>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResumeUpload;