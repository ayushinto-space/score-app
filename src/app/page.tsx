'use client';

import React, { useState, useEffect, useRef } from 'react';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';

type QuestionType = 'mcq' | 'multiple_correct' | 'integer' | 'fill_blank';

interface Question {
  id: string;
  type?: QuestionType;
  section?: string;
  question: string;
  options?: string[];
  correctOptionIndex?: number;
  correctOptionIndexes?: number[];
  correctAnswer?: string | number;
  explanation?: string;
}

const MathRenderer: React.FC<{ text?: string }> = ({ text = '' }) => {
  if (!text) return null;

  if (text.includes('\\begin{tabular}')) {
    return (
      <div className="my-3 p-4 bg-slate-50 border border-slate-200 rounded-xl overflow-x-auto text-sm font-mono text-slate-800">
        <p className="font-sans font-bold text-xs text-blue-600 uppercase mb-2">Matrix / Tabular Content:</p>
        <div className="whitespace-pre-line leading-relaxed font-sans">
          {text
            .replace(/\\begin\{tabular\}.*?\\hline/g, '')
            .replace(/\\end\{tabular\}/g, '')
            .replace(/\\\\\\hline/g, '\n-----------------------------------\n')
            .replace(/\\\\/g, '\n')
            .replace(/&/g, ' | ')
          }
        </div>
      </div>
    );
  }

  const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^\$\n]*?\$)/g);

  return (
    <span className="leading-relaxed">
      {parts.map((part, i) => {
        if (part.startsWith('$$') && part.endsWith('$$') && part.length > 4) {
          const math = part.slice(2, -2);
          return (
            <div key={i} className="my-2 overflow-x-auto py-1 text-center">
              <BlockMath math={math} />
            </div>
          );
        } else if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
          const math = part.slice(1, -1);
          return <InlineMath key={i} math={math} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
};

export default function CBTApp() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, any>>({});
  const [markedForReview, setMarkedForReview] = useState<Record<number, boolean>>({});
  const [visited, setVisited] = useState<Record<number, boolean>>({ 0: true });
  const [isUploading, setIsUploading] = useState(false);
  const [testSubmitted, setTestSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(1800);

  // Drawing Canvas State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState(true);
  const [pencilWidth, setPencilWidth] = useState(2);
  const [isEraser, setIsEraser] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx?.drawImage(canvas, 0, 0);

        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(tempCanvas, 0, 0);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        }
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [questions.length]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!drawMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !drawMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.strokeStyle = isEraser ? '#ffffff' : '#0f172a';
    ctx.lineWidth = isEraser ? pencilWidth * 6 : pencilWidth;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  useEffect(() => {
    if (questions.length === 0 || testSubmitted) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [questions, testSubmitted]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/parse', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.questions && Array.isArray(data.questions) && data.questions.length > 0) {
        setQuestions(data.questions);
        setCurrentIndex(0);
        setUserAnswers({});
        setMarkedForReview({});
        setVisited({ 0: true });
        setTestSubmitted(false);
        setTimeLeft(data.questions.length * 120);
      } else {
        alert('Extraction failed: ' + (data.error || 'No valid questions parsed.'));
      }
    } catch (err) {
      alert('Error uploading or processing document.');
    } finally {
      setIsUploading(false);
    }
  };

  const navigateTo = (index: number) => {
    setCurrentIndex(index);
    setVisited((prev) => ({ ...prev, [index]: true }));
  };

  const handleAnswerSelect = (value: any, type: QuestionType = 'mcq') => {
    if (type === 'multiple_correct') {
      const currentSelected: number[] = userAnswers[currentIndex] || [];
      const updated = currentSelected.includes(value)
        ? currentSelected.filter((v) => v !== value)
        : [...currentSelected, value];
      setUserAnswers((prev) => ({ ...prev, [currentIndex]: updated }));
    } else {
      setUserAnswers((prev) => ({ ...prev, [currentIndex]: value }));
    }
  };

  const toggleReview = () => {
    setMarkedForReview((prev) => ({ ...prev, [currentIndex]: !prev[currentIndex] }));
  };

  const calculateScore = () => {
    let score = 0;
    let correct = 0;
    let wrong = 0;

    questions.forEach((q, idx) => {
      const uAns = userAnswers[idx];
      if (uAns === undefined || uAns === '' || (Array.isArray(uAns) && uAns.length === 0)) {
        return;
      }

      const qType = q.type || 'mcq';

      if (qType === 'mcq') {
        const userVal = Number(uAns);
        const correctVal = Number(q.correctOptionIndex);

        if (!isNaN(userVal) && userVal === correctVal) {
          score += 4;
          correct++;
        } else {
          score -= 1;
          wrong++;
        }
      } else if (qType === 'multiple_correct') {
        const correctSet = (q.correctOptionIndexes || []).map(Number);
        const userArray = (Array.isArray(uAns) ? uAns : []).map(Number);

        const isExactMatch =
          userArray.length === correctSet.length &&
          userArray.every((val) => correctSet.includes(val));

        if (isExactMatch) {
          score += 4;
          correct++;
        } else {
          score -= 1;
          wrong++;
        }
      } else if (qType === 'integer' || qType === 'fill_blank') {
        if (String(uAns).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase()) {
          score += 4;
          correct++;
        } else {
          score -= 1;
          wrong++;
        }
      }
    });

    return { score, correct, wrong, unattempted: questions.length - (correct + wrong) };
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // 1. HOME SCREEN VIEW
  if (questions.length === 0) {
    return (
      <div className="relative min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 overflow-hidden select-none">
        <div className="relative w-full max-w-4xl min-h-[85vh] bg-white rounded-2xl shadow-2xl border border-slate-700 flex flex-col overflow-hidden">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className={`absolute inset-0 z-20 ${drawMode ? 'cursor-crosshair' : 'pointer-events-none'}`}
          />

          <div className="relative z-30 bg-slate-100 border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-4 text-xs font-medium text-slate-700">
            <div className="flex items-center gap-3">
              <span className="font-bold text-slate-900">✏️ Scratchpad:</span>
              <button
                onClick={() => setDrawMode(!drawMode)}
                className={`px-3 py-1.5 rounded-lg border transition-all ${drawMode ? 'bg-slate-900 text-white border-slate-900 font-bold' : 'bg-white border-slate-300'}`}
              >
                {drawMode ? 'Drawing On' : 'Drawing Off'}
              </button>
            </div>

            {drawMode && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsEraser(false)}
                    className={`px-3 py-1 rounded border font-semibold ${!isEraser ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-300'}`}
                  >
                    ✏️ Pencil
                  </button>
                  <button
                    onClick={() => setIsEraser(true)}
                    className={`px-3 py-1 rounded border font-semibold ${isEraser ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-slate-300'}`}
                  >
                    🧹 Eraser
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span>Size:</span>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    value={pencilWidth}
                    onChange={(e) => setPencilWidth(Number(e.target.value))}
                    className="w-20 cursor-pointer accent-slate-900"
                  />
                </div>

                <button
                  onClick={clearCanvas}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1.5 rounded transition-colors"
                >
                  Clear Canvas
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 px-8 py-16 flex flex-col items-center justify-center text-center z-10 pointer-events-none">
            <div className="bg-white/95 p-8 rounded-2xl border border-slate-200 shadow-xl max-w-lg pointer-events-auto backdrop-blur">
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
                CBT Test Engine
              </h1>
              <p className="text-slate-600 text-sm leading-relaxed mb-8">
                Upload any exam PDF or image to convert it into a standardized Computer-Based Test with automated grading and complete step-by-step LaTeX solutions.
              </p>

              <label className="inline-flex items-center gap-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-sm px-7 py-3.5 rounded-xl shadow-lg cursor-pointer transition-all">
                {isUploading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Parsing Document...
                  </span>
                ) : (
                  <>
                    <span>📄</span> Upload Test Paper (PDF / Image)
                  </>
                )}
                <input
                  type="file"
                  accept="image/*,application/pdf,.pdf"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>

              <div className="mt-4 text-xs text-slate-400">
                Draw or scribble notes on the background anytime during preparation.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. SUBMITTED TEST SUMMARY VIEW (WITH FULL STEP-BY-STEP SOLUTIONS)
  if (testSubmitted) {
    const stats = calculateScore();
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6 md:p-10 max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-emerald-400">Test Performance Summary</h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow">
            <p className="text-xs text-slate-400 font-semibold uppercase">Total Score</p>
            <p className="text-3xl font-extrabold text-blue-400 mt-1">
              {stats.score} / {questions.length * 4}
            </p>
          </div>
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow">
            <p className="text-xs text-slate-400 font-semibold uppercase">Correct Answers</p>
            <p className="text-3xl font-extrabold text-emerald-400 mt-1">{stats.correct}</p>
          </div>
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow">
            <p className="text-xs text-slate-400 font-semibold uppercase">Wrong Answers</p>
            <p className="text-3xl font-extrabold text-rose-400 mt-1">{stats.wrong}</p>
          </div>
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow">
            <p className="text-xs text-slate-400 font-semibold uppercase">Unattempted</p>
            <p className="text-3xl font-extrabold text-slate-400 mt-1">{stats.unattempted}</p>
          </div>
        </div>

        <div className="space-y-6 mb-8">
          <h2 className="text-xl font-bold text-slate-200">Detailed Solutions & Explanations</h2>
          {questions.map((qItem, idx) => {
            const userAns = userAnswers[idx];
            const qType = qItem.type || 'mcq';

            return (
              <div key={idx} className="bg-slate-800 p-5 rounded-xl border border-slate-700">
                <div className="flex justify-between items-start mb-3">
                  <span className="font-bold text-slate-300">Question {idx + 1}</span>
                  <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded uppercase">
                    Type: {qType.replace('_', ' ')}
                  </span>
                </div>

                <div className="text-slate-100 font-medium mb-4">
                  <MathRenderer text={qItem.question} />
                </div>

                {qItem.options && qItem.options.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm my-3">
                    {qItem.options.map((opt, oIdx) => {
                      let style = 'border-slate-700 bg-slate-900/50 text-slate-300';

                      const isCorrectOpt = qType === 'multiple_correct'
                        ? (qItem.correctOptionIndexes || []).map(Number).includes(oIdx)
                        : Number(qItem.correctOptionIndex) === oIdx;

                      const isUserChosen = qType === 'multiple_correct'
                        ? Array.isArray(userAns) && userAns.map(Number).includes(oIdx)
                        : Number(userAns) === oIdx;

                      if (isCorrectOpt) {
                        style = 'border-emerald-500 bg-emerald-950/50 text-emerald-300 font-medium';
                      } else if (isUserChosen && !isCorrectOpt) {
                        style = 'border-rose-500 bg-rose-950/50 text-rose-300';
                      }

                      return (
                        <div key={oIdx} className={`p-3 rounded-lg border ${style} flex items-start gap-2`}>
                          <span className="font-bold">{String.fromCharCode(65 + oIdx)}.</span>
                          <div>
                            <MathRenderer text={opt} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm bg-slate-900/60 p-3 rounded-lg border border-slate-700 my-2">
                    <p>
                      <strong className="text-slate-400">Your Answer: </strong>
                      <span className="text-blue-300">{userAns !== undefined ? String(userAns) : 'None'}</span>
                    </p>
                    <p>
                      <strong className="text-slate-400">Correct Answer: </strong>
                      <span className="text-emerald-400">{String(qItem.correctAnswer)}</span>
                    </p>
                  </div>
                )}

                {qItem.explanation && (
                  <div className="text-sm text-slate-200 mt-4 bg-slate-900/90 p-4 rounded-xl border border-amber-500/30">
                    <strong className="text-amber-400 block mb-2 font-bold uppercase tracking-wider text-xs">
                      💡 Step-by-Step Solution:
                    </strong>
                    <MathRenderer text={qItem.explanation} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={() => setQuestions([])}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-3 rounded-xl shadow transition-all"
        >
          Upload Another Test Paper
        </button>
      </div>
    );
  }

  // 3. ACTIVE TEST EXAMINATION VIEW
  const q = questions[currentIndex];
  const qType = q?.type || 'mcq';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col h-screen">
      <header className="bg-blue-900 text-white px-6 py-3 flex justify-between items-center shadow-md shrink-0">
        <h1 className="font-bold text-lg tracking-wide flex items-center gap-2">
          <span>⚡</span> CBT Examination Portal
        </h1>
        <div className="flex items-center gap-6">
          <div className="bg-blue-950 px-4 py-1.5 rounded-lg font-mono font-bold text-amber-400 border border-blue-800">
            Time Remaining: {formatTime(timeLeft)}
          </div>
          <button
            onClick={() => setTestSubmitted(true)}
            className="bg-rose-600 hover:bg-rose-500 text-white px-5 py-1.5 rounded-lg text-sm font-bold transition-all shadow"
          >
            Submit Test
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 p-6 overflow-y-auto bg-white flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <div className="flex items-center gap-3">
                <span className="font-bold text-slate-700 text-base">
                  Question {currentIndex + 1} of {questions.length}
                </span>
                <span className="text-xs bg-blue-100 text-blue-800 font-semibold px-2.5 py-1 rounded-full uppercase">
                  {qType.replace('_', ' ')}
                </span>
              </div>
              <span className="text-xs bg-slate-100 text-slate-700 font-medium px-3 py-1 rounded border">
                Section: {q.section || 'General'}
              </span>
            </div>

            <div className="text-lg font-medium mb-6 text-slate-800 leading-relaxed">
              <MathRenderer text={q.question} />
            </div>

            {qType === 'mcq' && q.options && (
              <div className="space-y-3">
                {q.options.map((opt, oIdx) => {
                  const isSelected = Number(userAnswers[currentIndex]) === oIdx;
                  return (
                    <button
                      key={oIdx}
                      onClick={() => handleAnswerSelect(oIdx, 'mcq')}
                      className={`w-full text-left p-4 rounded-xl border text-sm transition-all flex items-start gap-3 ${isSelected
                        ? 'border-blue-600 bg-blue-50 font-semibold text-blue-900 ring-2 ring-blue-600/30'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                        }`}
                    >
                      <span
                        className={`w-6 h-6 rounded-full border text-xs flex items-center justify-center font-bold shrink-0 mt-0.5 ${isSelected
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-slate-300 text-slate-500'
                          }`}
                      >
                        {String.fromCharCode(65 + oIdx)}
                      </span>
                      <div className="flex-1">
                        <MathRenderer text={opt} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {qType === 'multiple_correct' && q.options && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-amber-700 bg-amber-50 p-2 rounded border border-amber-200 mb-2">
                  ℹ️ Note: Select all correct options that apply.
                </p>
                {q.options.map((opt, oIdx) => {
                  const selectedOpts: number[] = userAnswers[currentIndex] || [];
                  const isSelected = selectedOpts.includes(oIdx);
                  return (
                    <button
                      key={oIdx}
                      onClick={() => handleAnswerSelect(oIdx, 'multiple_correct')}
                      className={`w-full text-left p-4 rounded-xl border text-sm transition-all flex items-start gap-3 ${isSelected
                        ? 'border-purple-600 bg-purple-50 font-semibold text-purple-900 ring-2 ring-purple-600/30'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                        }`}
                    >
                      <div
                        className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 mt-0.5 ${isSelected ? 'bg-purple-600 border-purple-600 text-white' : 'border-slate-300'
                          }`}
                      >
                        {isSelected && '✓'}
                      </div>
                      <div className="flex-1">
                        <MathRenderer text={opt} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {(qType === 'integer' || qType === 'fill_blank') && (
              <div className="my-6 max-w-md">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Enter Your Numerical Answer:
                </label>
                <input
                  type="text"
                  value={userAnswers[currentIndex] || ''}
                  onChange={(e) => handleAnswerSelect(e.target.value, qType)}
                  placeholder="Type your answer here..."
                  className="w-full p-3 border-2 border-slate-300 rounded-lg text-lg focus:border-blue-600 focus:outline-none font-mono"
                />
              </div>
            )}
          </div>

          <div className="border-t pt-4 flex justify-between items-center mt-6">
            <button
              onClick={toggleReview}
              className={`px-4 py-2 text-sm rounded-lg font-semibold transition-all ${markedForReview[currentIndex]
                ? 'bg-purple-600 text-white shadow'
                : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                }`}
            >
              {markedForReview[currentIndex] ? 'Unmark Review' : 'Mark for Review'}
            </button>

            <div className="flex gap-3">
              <button
                disabled={currentIndex === 0}
                onClick={() => navigateTo(currentIndex - 1)}
                className="px-5 py-2 border border-slate-300 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-slate-50"
              >
                Previous
              </button>
              <button
                disabled={currentIndex === questions.length - 1}
                onClick={() => navigateTo(currentIndex + 1)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-all shadow"
              >
                Save & Next
              </button>
            </div>
          </div>
        </div>

        <div className="w-80 bg-slate-50 border-l border-slate-200 p-4 flex flex-col justify-between shrink-0">
          <div>
            <h3 className="font-bold text-sm text-slate-700 mb-3">Question Palette</h3>
            <div className="grid grid-cols-5 gap-2 max-h-[calc(100vh-280px)] overflow-y-auto p-1">
              {questions.map((_, idx) => {
                const uAns = userAnswers[idx];
                const isAns = uAns !== undefined && uAns !== '' && (!Array.isArray(uAns) || uAns.length > 0);
                const isRev = markedForReview[idx];
                const isVis = visited[idx];

                let bgClass = 'bg-slate-200 text-slate-700';
                if (isRev && isAns) bgClass = 'bg-purple-600 text-white ring-2 ring-emerald-400';
                else if (isRev) bgClass = 'bg-purple-600 text-white';
                else if (isAns) bgClass = 'bg-emerald-600 text-white';
                else if (isVis) bgClass = 'bg-rose-500 text-white';

                return (
                  <button
                    key={idx}
                    onClick={() => navigateTo(idx)}
                    className={`w-10 h-10 rounded-lg text-xs font-bold transition-all shadow-sm ${bgClass} ${currentIndex === idx ? 'ring-2 ring-offset-2 ring-blue-600' : ''}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="text-xs space-y-2 border-t border-slate-200 pt-3 text-slate-600 bg-white p-3 rounded-xl border shadow-sm">
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 bg-emerald-600 inline-block rounded"></span> Answered
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 bg-rose-500 inline-block rounded"></span> Not Answered
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 bg-purple-600 inline-block rounded"></span> Marked for Review
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 bg-slate-200 inline-block rounded border"></span> Not Visited
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}