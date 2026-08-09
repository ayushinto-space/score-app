'use client';

import React, { useState, useEffect } from 'react';
import 'katex/dist/katex.min.css';
import { InlineMath } from 'react-katex';

interface Question {
  id: string;
  section: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
  explanation?: string;
}

export default function CBTApp() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [markedForReview, setMarkedForReview] = useState<Record<number, boolean>>({});
  const [visited, setVisited] = useState<Record<number, boolean>>({ 0: true });
  const [isUploading, setIsUploading] = useState(false);
  const [testSubmitted, setTestSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(1800); // 30 minutes default timer

  // Countdown timer logic
  useEffect(() => {
    if (questions.length === 0 || testSubmitted) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [questions, testSubmitted]);

  // Handle PDF/Image upload and parsing
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
        setTimeLeft(data.questions.length * 120); // 2 minutes per question default
      } else {
        alert('Extraction failed: ' + (data.error || 'No questions could be extracted from this document.'));
      }
    } catch (err) {
      alert('Error uploading or processing the file.');
    } finally {
      setIsUploading(false);
    }
  };

  const navigateTo = (index: number) => {
    setCurrentIndex(index);
    setVisited((prev) => ({ ...prev, [index]: true }));
  };

  const handleOptionSelect = (optIndex: number) => {
    setUserAnswers((prev) => ({ ...prev, [currentIndex]: optIndex }));
  };

  const toggleReview = () => {
    setMarkedForReview((prev) => ({ ...prev, [currentIndex]: !prev[currentIndex] }));
  };

  // Helper to safely render text with inline LaTeX ($...$)
  const renderTextWithMath = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\$.*?\$)/g);
    return parts.map((part, i) => {
      if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
        return <InlineMath key={i} math={part.slice(1, -1)} />;
      }
      return <span key={i}>{part}</span>;
    });
  };

  // Calculate score (+4 for correct, -1 for incorrect)
  const calculateScore = () => {
    let score = 0;
    let correct = 0;
    let wrong = 0;

    questions.forEach((q, idx) => {
      if (userAnswers[idx] !== undefined) {
        if (userAnswers[idx] === q.correctOptionIndex) {
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

  // 1. Initial State: Upload File Screen
  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6">
        <h1 className="text-3xl font-bold mb-3">CBT Test Converter</h1>
        <p className="text-slate-400 mb-8 text-center max-w-md">
          Upload any test paper soft copy (PDF or Image) to parse all questions into an interactive NTA-style CBT test.
        </p>

        <label className="bg-blue-600 hover:bg-blue-500 cursor-pointer text-white font-semibold px-6 py-3.5 rounded-lg shadow-lg transition-all flex items-center gap-3">
          {isUploading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Parsing Document Pages with AI...
            </span>
          ) : (
            'Upload Test Paper (PDF / Image)'
          )}
          <input
            type="file"
            accept="image/*,application/pdf,.pdf"
            onChange={handleFileUpload}
            disabled={isUploading}
            className="hidden"
          />
        </label>
      </div>
    );
  }

  // 2. Test Submitted: Performance Summary Dashboard
  if (testSubmitted) {
    const stats = calculateScore();
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8 max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-emerald-400">Test Performance Summary</h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <p className="text-sm text-slate-400">Total Score</p>
            <p className="text-2xl font-bold text-blue-400">{stats.score} / {questions.length * 4}</p>
          </div>
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <p className="text-sm text-slate-400">Correct Answers</p>
            <p className="text-2xl font-bold text-emerald-400">{stats.correct}</p>
          </div>
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <p className="text-sm text-slate-400">Wrong Answers</p>
            <p className="text-2xl font-bold text-rose-400">{stats.wrong}</p>
          </div>
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <p className="text-sm text-slate-400">Unattempted</p>
            <p className="text-2xl font-bold text-slate-400">{stats.unattempted}</p>
          </div>
        </div>

        {/* Question Solutions List */}
        <div className="space-y-6 mb-8">
          <h2 className="text-xl font-bold text-slate-200">Solutions & Detailed Analysis</h2>
          {questions.map((qItem, idx) => {
            const userAns = userAnswers[idx];
            const isCorrect = userAns === qItem.correctOptionIndex;
            return (
              <div key={idx} className="bg-slate-800 p-5 rounded-lg border border-slate-700">
                <p className="font-bold text-slate-300 mb-2">Q{idx + 1}. {renderTextWithMath(qItem.question)}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm my-3">
                  {qItem.options.map((opt, oIdx) => {
                    let border = 'border-slate-700 bg-slate-900/50';
                    if (oIdx === qItem.correctOptionIndex) border = 'border-emerald-500 bg-emerald-950/40 text-emerald-300';
                    else if (userAns === oIdx) border = 'border-rose-500 bg-rose-950/40 text-rose-300';

                    return (
                      <div key={oIdx} className={`p-2.5 rounded border ${border}`}>
                        <span className="font-bold mr-2">{String.fromCharCode(65 + oIdx)}.</span>
                        {renderTextWithMath(opt)}
                      </div>
                    );
                  })}
                </div>
                {qItem.explanation && (
                  <p className="text-xs text-slate-400 mt-2 bg-slate-900/80 p-2.5 rounded">
                    <strong className="text-slate-300">Explanation: </strong> {qItem.explanation}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={() => setQuestions([])}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-2.5 rounded-lg shadow"
        >
          Upload Another Test
        </button>
      </div>
    );
  }

  // 3. Active Test State: NTA-style CBT Portal
  const q = questions[currentIndex];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col h-screen">
      {/* Top Header Navigation */}
      <header className="bg-blue-900 text-white px-6 py-3.5 flex justify-between items-center shadow-md">
        <h1 className="font-bold text-lg tracking-wide">CBT Online Portal</h1>
        <div className="flex items-center gap-6">
          <div className="bg-blue-950 px-4 py-1.5 rounded font-mono font-bold text-amber-400 border border-blue-800">
            Time Remaining: {formatTime(timeLeft)}
          </div>
          <button
            onClick={() => setTestSubmitted(true)}
            className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-1.5 rounded text-sm font-bold transition-all shadow"
          >
            Submit Test
          </button>
        </div>
      </header>

      {/* Main Examination Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Question display and options */}
        <div className="flex-1 p-6 overflow-y-auto bg-white flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <span className="font-bold text-slate-600">Question {currentIndex + 1} of {questions.length}</span>
              <span className="text-xs bg-slate-100 text-slate-700 font-medium px-3 py-1 rounded border">
                Section: {q.section || 'General'}
              </span>
            </div>

            <div className="text-lg font-medium mb-6 text-slate-800 leading-relaxed">
              {renderTextWithMath(q.question)}
            </div>

            <div className="space-y-3">
              {q.options.map((opt, oIdx) => {
                const isSelected = userAnswers[currentIndex] === oIdx;
                return (
                  <button
                    key={oIdx}
                    onClick={() => handleOptionSelect(oIdx)}
                    className={`w-full text-left p-4 rounded-lg border text-sm transition-all flex items-center gap-3 ${isSelected
                        ? 'border-blue-600 bg-blue-50 font-semibold text-blue-900 ring-1 ring-blue-600'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                  >
                    <span className={`w-6 h-6 rounded-full border text-xs flex items-center justify-center font-bold shrink-0 ${isSelected ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 text-slate-500'}`}>
                      {String.fromCharCode(65 + oIdx)}
                    </span>
                    <div className="flex-1">{renderTextWithMath(opt)}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom Action Controls */}
          <div className="border-t pt-4 flex justify-between items-center mt-6">
            <button
              onClick={toggleReview}
              className={`px-4 py-2 text-sm rounded font-semibold transition-all ${markedForReview[currentIndex]
                  ? 'bg-purple-600 text-white'
                  : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                }`}
            >
              {markedForReview[currentIndex] ? 'Unmark Review' : 'Mark for Review'}
            </button>

            <div className="flex gap-2">
              <button
                disabled={currentIndex === 0}
                onClick={() => navigateTo(currentIndex - 1)}
                className="px-4 py-2 border border-slate-300 rounded text-sm font-medium disabled:opacity-40 hover:bg-slate-50"
              >
                Previous
              </button>
              <button
                disabled={currentIndex === questions.length - 1}
                onClick={() => navigateTo(currentIndex + 1)}
                className="px-6 py-2 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-500 disabled:opacity-40 transition-all"
              >
                Save & Next
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Question Palette */}
        <div className="w-80 bg-slate-50 border-l border-slate-200 p-4 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-700 mb-3">Question Palette</h3>
            <div className="grid grid-cols-5 gap-2 max-h-[calc(100vh-280px)] overflow-y-auto p-1">
              {questions.map((_, idx) => {
                const isAns = userAnswers[idx] !== undefined;
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
                    className={`w-10 h-10 rounded text-xs font-bold transition-all shadow-sm ${bgClass} ${currentIndex === idx ? 'ring-2 ring-offset-2 ring-blue-600' : ''
                      }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Palette Color Legend */}
          <div className="text-xs space-y-2 border-t border-slate-200 pt-3 text-slate-600 bg-white p-3 rounded-lg border">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-emerald-600 inline-block rounded"></span> Answered
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-rose-500 inline-block rounded"></span> Not Answered
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-purple-600 inline-block rounded"></span> Marked for Review
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-slate-200 inline-block rounded border"></span> Not Visited
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}