import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { problemsAPI } from '../services/api';
import CodeEditor from '../components/CodeEditor';

interface Problem {
  id: number;
  title: string;
  problem_statement: string;
  difficulty_level: string;
  time_limit_ms: number;
  memory_limit_mb: number;
  total_problems_solved: number;
  is_active: boolean;
  constraints?: string;
  topic_tags?: string[];
}

interface TestCase {
  id: number;
  input_data: string;
  expected_output: string;
  weight: number;
  is_sample: boolean;
}

const ProblemDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('cpp');
  const [submitting, setSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<any>(null);
  const [testResults, setTestResults] = useState<any[]>([]);
  const [testingWithLLM, setTestingWithLLM] = useState(false);
  const [combinedResults, setCombinedResults] = useState<any>(null);
  const [rawOutput, setRawOutput] = useState<string>('');

  // Timer state
  const [timerActive, setTimerActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);

  const languages = [
    { id: 'c', name: 'C', extension: '.c' },
    { id: 'cpp', name: 'C++', extension: '.cpp' },
    { id: 'java', name: 'Java', extension: '.java' },
    { id: 'python', name: 'Python', extension: '.py' },
    { id: 'javascript', name: 'JavaScript', extension: '.js' }
  ];

  // Timer functionality
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerActive) {
      interval = setInterval(() => {
        setTimerSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerActive]);

  const startTimer = () => {
    setTimerActive(true);
    setStartTime(new Date());
    setTimerSeconds(0);
  };

  const stopTimer = () => {
    setTimerActive(false);
    // You could save the total time here if needed
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Auto-start timer when component mounts
  useEffect(() => {
    if (id && !timerActive) {
      startTimer();
    }
  }, [id]);

  const fetchProblem = useCallback(async () => {
    try {
      console.log('Fetching problem with ID:', id);
      const response = await problemsAPI.getById(id!);
      console.log('Problem API response:', response);
      
      if (response.data && response.data.success) {
        setProblem(response.data.problem);
        console.log('Problem set:', response.data.problem);
      } else {
        console.error('Invalid response format:', response.data);
        setError('Invalid problem data received');
      }
    } catch (err) {
      console.error('Error fetching problem:', err);
      setError('Failed to fetch problem');
    }
  }, [id]);

  const fetchTestCases = useCallback(async () => {
    try {
      console.log('Fetching test cases for problem ID:', id);
      const response = await problemsAPI.getTestCases(id!);
      console.log('Test cases API response:', response);
      
      if (response.data && response.data.success && response.data.test_cases) {
        setTestCases(response.data.test_cases);
        console.log('Test cases set:', response.data.test_cases);
      } else {
        console.error('Failed to fetch test cases:', response.data);
        setTestCases([]);
      }
    } catch (err) {
      console.error('Error fetching test cases:', err);
      setTestCases([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchProblem();
      fetchTestCases();
    }
  }, [id, fetchProblem, fetchTestCases]);

  const handleSubmit = async () => {
    if (!code.trim()) {
      alert('Please write some code before submitting');
      return;
    }

    try {
      setSubmitting(true);
      setSubmissionResult(null);

      const response = await problemsAPI.submit(id!, {
        language,
        code: code
      });

      setSubmissionResult(response.data);
      
      // Show results immediately
      if (response.data.results) {
        setTestResults(response.data.results.test_cases);
      }
      
      // Show success message
      alert(`Solution submitted successfully! Status: ${response.data.status}. Passed: ${response.data.results?.passed || 0}/${response.data.results?.total || 0} test cases.`);
      
    } catch (err: any) {
      console.error('Submission error:', err);
      alert(err.response?.data?.message || 'Failed to submit solution');
    } finally {
      setSubmitting(false);
    }
  };



  const handleRunAndTestWithLLM = async () => {
    if (!code.trim()) {
      alert('Please write some code before running');
      return;
    }

    try {
      setTestingWithLLM(true);
      setTestResults([]);
      setCombinedResults(null);

      // First, run the code to get raw output
      console.log('Running code to get output...');
      
      // Execute code with empty input to see raw output
      const runResponse = await fetch(`http://localhost:5000/api/problems/${id}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          code,
          language
        })
      });

      const runResult = await runResponse.json();
      
      if (runResult.success) {
        // Handle different types of output
        let outputText = '';
        if (runResult.error) {
          outputText = `Error: ${runResult.error}`;
        } else if (runResult.compile_output) {
          outputText = `Compilation Error:\n${runResult.compile_output}`;
        } else if (runResult.stderr) {
          outputText = `Runtime Error:\n${runResult.stderr}`;
        } else {
          outputText = runResult.output || 'No output';
        }
        setRawOutput(outputText);
        console.log('Raw output:', outputText);
      } else {
        setRawOutput(`Error: ${runResult.error || 'Unknown error'}`);
        console.log('Run error:', runResult.error);
      }

      // Then, test against test cases with LLM interpretation
      console.log('Testing code against test cases with LLM...');
      
      const testResponse = await fetch(`http://localhost:5000/api/problems/${id}/test-llm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          code,
          language
        })
      });

      const testResult = await testResponse.json();
      
      if (testResult.success) {
        setTestResults(testResult.results);
        console.log('Test results with LLM:', testResult.results);
      } else {
        console.log('Test with LLM failed:', testResult.error);
        // If test fails, still show the raw output
        if (testResult.error === 'No test cases available') {
          console.log('No test cases available for this problem');
        }
      }

      // Set combined results
      setCombinedResults({
        rawOutput: runResult.success ? runResult.output : null,
        testResults: testResult.success ? testResult.results : [],
        hasErrors: !runResult.success || (testResult.success === false && testResult.error && testResult.error !== 'No test cases available'),
        llmEnabled: true
      });
      
    } catch (err: any) {
      console.error('Run and test with LLM error:', err);
      setRawOutput(`Error: ${err.message}`);
      setCombinedResults({
        rawOutput: null,
        testResults: [],
        hasErrors: true,
        error: err.message
      });
    } finally {
      setTestingWithLLM(false);
    }
  };

  const getDifficultyColor = (difficulty: string | undefined) => {
    if (!difficulty) return 'text-gray-600 bg-gray-100';
    
    switch (difficulty.toLowerCase()) {
      case 'easy': return 'text-green-600 bg-green-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'hard': return 'text-red-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !problem) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Problem Not Found</h2>
          <p className="text-gray-600 mb-4">{error || 'The problem you are looking for does not exist.'}</p>
          <button 
            onClick={() => navigate('/practice')}
            className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition-colors"
          >
            Back to Problems
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Problem Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{problem.title}</h1>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span className={`px-3 py-1 rounded-full font-medium ${getDifficultyColor(problem.difficulty_level)}`}>
                  {problem.difficulty_level}
                </span>
                <span>Time Limit: {problem.time_limit_ms}ms</span>
                <span>Memory Limit: {problem.memory_limit_mb}MB</span>
                {Array.isArray(problem.topic_tags) && problem.topic_tags.length > 0 && (
                  <span>Topics: {problem.topic_tags.join(', ')}</span>
                )}
                <span>Solved: {problem.total_problems_solved || 0}</span>
              </div>
            </div>
            <button
              onClick={() => navigate('/practice')}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              ← Back to Practice
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Problem Description */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6 border-b border-gray-200 pb-3">Problem Description</h2>
            <div className="prose prose-sm max-w-none">
              <div 
                className="problem-content text-base"
                dangerouslySetInnerHTML={{ 
                  __html: problem.problem_statement || 'No problem statement available.' 
                }}
              />
            </div>
            
          </div>

          {/* Code Editor */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6 border-b border-gray-200 pb-3">
              <h2 className="text-xl font-semibold text-gray-900">Your Solution</h2>
              <div className="flex items-center gap-4">
                {/* Timer Display */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg px-4 py-3 shadow-sm">
                  <div className="text-center">
                    <div className="text-xs text-blue-600 font-medium mb-1">Timer</div>
                    <div className="text-lg font-mono text-blue-800 font-bold">
                      {formatTime(timerSeconds)}
                    </div>
                    <div className="flex gap-1 mt-2">
                      {timerActive ? (
                        <button
                          onClick={stopTimer}
                          className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-md hover:bg-red-200 transition-colors font-medium"
                        >
                          Stop
                        </button>
                      ) : (
                        <button
                          onClick={startTimer}
                          className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-md hover:bg-green-200 transition-colors font-medium"
                        >
                          Start
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  {languages.map(lang => (
                    <option key={lang.id} value={lang.id}>
                      {lang.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border border-gray-300 rounded-lg overflow-hidden mb-6 shadow-sm">
              <CodeEditor
                language={language}
                value={code}
                onChange={setCode}
                height="400px"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 bg-gradient-to-r from-green-600 to-green-700 text-white py-3 px-6 rounded-lg font-medium hover:from-green-700 hover:to-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
              >
                {submitting ? 'Submitting...' : 'Submit Solution'}
              </button>
              <button
                onClick={() => setCode('')}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors shadow-sm"
              >
                Clear
              </button>
              <button
                onClick={handleRunAndTestWithLLM}
                disabled={testingWithLLM}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 transition-all duration-200 shadow-sm"
                title="Run code to see output and test against test cases with LLM interpretation"
              >
                {testingWithLLM ? 'Running & Testing...' : 'Run & Test Code'}
              </button>
            </div>

            {/* Combined Code Output and Test Results */}
            {combinedResults && (
              <div className="mt-6 space-y-6">
                {/* Raw Code Output */}
                <div className="p-6 bg-gray-900 border border-gray-700 rounded-lg shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center">
                    <span className="mr-2">💻</span>
                    Code Output
                  </h3>
                  <div className="bg-black rounded-lg p-4 border border-gray-600">
                    <div className="text-green-400 font-mono text-sm">
                      <div className="mb-2">
                        <span className="text-gray-400">$ </span>
                        <span className="text-white">python solution.py</span>
                      </div>
                      <pre className="text-green-400 bg-gray-800 p-3 rounded border border-gray-600 overflow-x-auto">
                        {rawOutput || 'No output'}
                      </pre>
                    </div>
                  </div>
                </div>

                {/* Test Results */}
                {testResults.length > 0 && (
                  <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg shadow-sm">
                    <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center">
                      <span className="mr-2">🧪</span>
                      Test Results
                      {combinedResults.llmEnabled && (
                        <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded-full border border-purple-200">
                          🧠 LLM Enhanced
                        </span>
                      )}
                    </h3>
                    <div className="space-y-4">
                      {testResults.map((result, index) => (
                        <div key={index} className="bg-white p-4 rounded-lg border border-blue-100 shadow-sm">
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-medium text-gray-900">Test Case {index + 1}</span>
                            <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                              result.status === 'PASSED' 
                                ? 'text-green-700 bg-green-100 border border-green-200' 
                                : 'text-red-700 bg-red-100 border border-red-200'
                            }`}>
                              {result.status === 'PASSED' ? '✅ PASSED' : '❌ FAILED'}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-gray-700 text-xs uppercase tracking-wide">Original Input:</span>
                              <pre className="mt-1 bg-gray-50 p-3 rounded border text-xs overflow-x-auto font-mono border-gray-200">
                                {result.testCase.input_data}
                              </pre>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 text-xs uppercase tracking-wide">Compiler Input:</span>
                              <pre className="mt-1 bg-purple-50 p-3 rounded border text-xs overflow-x-auto font-mono border-purple-200">
                                {result.usedInput || result.testCase.input_data}
                              </pre>
                              {result.llmInterpretation && result.llmInterpretation.success && (
                                <div className="mt-2 p-2 bg-purple-100 border border-purple-300 rounded text-xs">
                                  <div className="font-medium text-purple-800 mb-1">🧠 LLM Enhanced</div>
                                  <div className="text-purple-700">
                                    <div><strong>Format:</strong> {result.llmInterpretation.input_format}</div>
                                    {result.llmInterpretation.language_specific_notes && (
                                      <div><strong>Notes:</strong> {result.llmInterpretation.language_specific_notes}</div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 text-xs uppercase tracking-wide">Expected Output:</span>
                              <pre className="mt-1 bg-gray-50 p-3 rounded border text-xs overflow-x-auto font-mono border-gray-200">
                                {result.testCase.expected_output}
                              </pre>
                            </div>
                          </div>
                          
                          {result.status === 'PASSED' ? (
                            <div className="mt-3">
                              <span className="font-medium text-gray-700 text-xs uppercase tracking-wide">Your Output:</span>
                              <pre className="mt-1 bg-green-50 p-3 rounded border text-xs overflow-x-auto font-mono text-green-800 border-green-200">
                                {result.output}
                              </pre>
                              <div className="mt-2 text-xs text-gray-600 flex items-center gap-4">
                                <span>⏱️ Time: {result.executionTime}ms</span>
                                <span>💾 Memory: {result.memory}KB</span>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-3">
                              <span className="font-medium text-gray-700 text-xs uppercase tracking-wide">Error:</span>
                              <pre className="mt-1 bg-red-50 p-3 rounded border text-xs overflow-x-auto font-mono text-red-800 border-red-200">
                                {result.error || 'Unknown error'}
                              </pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-blue-200">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-blue-700 font-medium">
                          ✅ Passed: {testResults.filter(r => r.status === 'PASSED').length} / {testResults.length}
                        </span>
                        <span className="text-sm text-blue-700 font-medium">
                          📊 Success Rate: {Math.round((testResults.filter(r => r.status === 'PASSED').length / testResults.length) * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* No Test Cases Available */}
                {combinedResults && testResults.length === 0 && !combinedResults.hasErrors && (
                  <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg shadow-sm">
                    <div className="flex items-center">
                      <div className="text-yellow-600 mr-2">ℹ️</div>
                      <span className="text-yellow-800 font-medium">No test cases available for this problem</span>
                    </div>
                    <p className="text-yellow-700 text-sm mt-1">
                      Your code executed successfully, but there are no test cases to validate against.
                    </p>
                  </div>
                )}

                {/* Error Summary */}
                {combinedResults.hasErrors && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center">
                      <div className="text-red-600 mr-2">⚠️</div>
                      <span className="text-red-800 font-medium">
                        {combinedResults.error === 'No test cases available' 
                          ? 'No test cases available for this problem' 
                          : 'Some issues occurred during execution'}
                      </span>
                    </div>
                    {combinedResults.error && combinedResults.error !== 'No test cases available' && (
                      <p className="text-red-700 text-sm mt-1">{combinedResults.error}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Remove the old separate sections */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProblemDetail;
