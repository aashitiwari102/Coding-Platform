const axios = require('axios');
const llmService = require('./llmService');

class Judge0Service {
    constructor() {
        this.apiKey = process.env.JUDGE0_API_KEY;
        this.apiHost = process.env.JUDGE0_API_HOST || 'judge0-ce.p.rapidapi.com';
        this.baseURL = process.env.JUDGE0_API_URL || 'https://judge0-ce.p.rapidapi.com';
        this.useRapidAPI = this.baseURL.includes('rapidapi.com');
        
        // Language mapping for Judge0
        this.languageMap = {
            'c': 50,           // C (GCC 9.2.0)
            'cpp': 54,         // C++ (GCC 9.2.0)
            'java': 62,        // Java (OpenJDK 13.0.1)
            'python': 71,      // Python (3.8.1)
            'javascript': 63   // JavaScript (Node.js 12.14.0)
        };
    }

    /**
     * Submit code for execution
     */
    async submitCode(code, language, input = '') {
        try {
            const languageId = this.languageMap[language.toLowerCase()];
            if (!languageId) {
                throw new Error(`Unsupported language: ${language}`);
            }

            const submission = {
                source_code: code,
                language_id: languageId,
                stdin: input,
                base64_encoded: true
            };

            let headers = {
                'Content-Type': 'application/json'
            };

            // Add RapidAPI headers if using RapidAPI
            if (this.useRapidAPI && this.apiKey) {
                headers['X-RapidAPI-Key'] = this.apiKey;
                headers['X-RapidAPI-Host'] = 'judge0-ce.p.rapidapi.com';
            }

            const response = await axios.post(`${this.baseURL}/submissions`, submission, { headers });

            return response.data.token;
        } catch (error) {
            console.error('Error submitting code to Judge0:', error);
            
            // Provide more helpful error messages
            if (error.response) {
                if (error.response.status === 401) {
                    throw new Error('Judge0 API key is invalid or missing. Please check your JUDGE0_API_KEY environment variable.');
                } else if (error.response.status === 429) {
                    throw new Error('Judge0 API rate limit exceeded. Please try again later.');
                } else if (error.response.status === 500) {
                    throw new Error('Judge0 service is temporarily unavailable. Please try again later.');
                }
            }
            
            throw new Error(`Failed to submit code: ${error.message}`);
        }
    }

    /**
     * Get submission result
     */
    async getSubmissionResult(token) {
        try {
            let headers = {};
            
            // Add RapidAPI headers if using RapidAPI
            if (this.useRapidAPI && this.apiKey) {
                headers['X-RapidAPI-Key'] = this.apiKey;
                headers['X-RapidAPI-Host'] = 'judge0-ce.p.rapidapi.com';
            }

            // Add base64_encoded=true to resolve UTF-8 encoding issues
            const response = await axios.get(`${this.baseURL}/submissions/${token}?base64_encoded=true`, { headers });

            // Decode base64 encoded fields
            const decodedData = this.decodeBase64Response(response.data);

            return decodedData;
        } catch (error) {
            console.error('Error getting submission result:', error);
            throw new Error(`Failed to get submission result: ${error.message}`);
        }
    }

    /**
     * Decode base64 encoded response fields
     */
    decodeBase64Response(data) {
        const decoded = { ...data };
        
        // Decode common base64 fields
        if (decoded.stdout && typeof decoded.stdout === 'string') {
            try {
                decoded.stdout = Buffer.from(decoded.stdout, 'base64').toString('utf-8');
            } catch (e) {
                console.warn('Failed to decode stdout from base64:', e);
            }
        }
        
        if (decoded.stderr && typeof decoded.stderr === 'string') {
            try {
                decoded.stderr = Buffer.from(decoded.stderr, 'base64').toString('utf-8');
            } catch (e) {
                console.warn('Failed to decode stderr from base64:', e);
            }
        }
        
        if (decoded.compile_output && typeof decoded.compile_output === 'string') {
            try {
                decoded.compile_output = Buffer.from(decoded.compile_output, 'base64').toString('utf-8');
            } catch (e) {
                console.warn('Failed to decode compile_output from base64:', e);
            }
        }
        
        return decoded;
    }

    /**
     * Wait for submission completion
     */
    async waitForSubmission(token, maxWaitTime = 30000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            try {
                const result = await this.getSubmissionResult(token);
                
                if (result.status && result.status.id > 2) { // Status > 2 means completed
                    return result;
                }
                
                // Wait 1 second before checking again
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error('Error waiting for submission:', error);
                throw error;
            }
        }
        
        throw new Error('Submission timeout');
    }

    /**
     * Execute code with input and return result
     */
    async executeCode(code, language, input = '') {
        try {
            console.log(`Executing ${language} code with input: "${input}"`);
            
            // Submit code
            const token = await this.submitCode(code, language, input);
            console.log('Code submitted, token:', token);
            
            // Wait for result
            const result = await this.waitForSubmission(token, 15000);
            console.log('Execution result:', result);
            
            // Handle different output scenarios
            if (result.status?.id === 3) { // Accepted
                return {
                    ...result,
                    stdout: result.stdout || 'No output',
                    stderr: result.stderr || '',
                    compile_output: result.compile_output || ''
                };
            } else if (result.status?.id === 6) { // Compilation Error
                return {
                    ...result,
                    stdout: '',
                    stderr: '',
                    compile_output: result.compile_output || 'Compilation Error'
                };
            } else if (result.status?.id === 5) { // Time Limit Exceeded
                return {
                    ...result,
                    stdout: '',
                    stderr: 'Time Limit Exceeded',
                    compile_output: ''
                };
            } else {
                return {
                    ...result,
                    stdout: result.stdout || '',
                    stderr: result.stderr || 'Runtime Error',
                    compile_output: result.compile_output || ''
                };
            }
        } catch (error) {
            console.error('Error executing code:', error);
            throw error;
        }
    }

    /**
     * Execute code against test cases
     */
    async executeTestCases(code, language, testCases) {
        try {
            console.log('Starting test case execution...');
            console.log('Language:', language);
            console.log('Code length:', code.length);
            console.log('Number of test cases:', testCases.length);
            console.log('Test cases:', JSON.stringify(testCases, null, 2));
            
            const results = [];
            
            for (const testCase of testCases) {
                try {
                    console.log(`Processing test case ${testCase.id}:`, {
                        input: testCase.input_data,
                        expected_output: testCase.expected_output,
                        is_sample: testCase.is_sample
                    });
                    
                    // Submit code with test case input
                    const token = await this.submitCode(code, language, testCase.input_data);
                    console.log(`Test case ${testCase.id} submitted, token:`, token);
                    
                    // Wait for completion
                    const result = await this.waitForSubmission(token);
                    console.log(`Test case ${testCase.id} completed:`, {
                        status_id: result.status?.id,
                        status_description: result.status?.description,
                        stdout: result.stdout,
                        stderr: result.stderr,
                        compile_output: result.compile_output
                    });
                    
                    // Check if execution was successful
                    if (result.status && result.status.id === 3) { // Accepted
                        const isCorrect = this.compareOutput(result.stdout, testCase.expected_output);
                        
                        results.push({
                            testCase: testCase,
                            status: isCorrect ? 'PASSED' : 'FAILED',
                            output: result.stdout,
                            expected: testCase.expected_output,
                            executionTime: result.time,
                            memory: result.memory,
                            error: null
                        });
                    } else if (result.status && result.status.id === 4) { // Wrong Answer
                        results.push({
                            testCase: testCase,
                            status: 'FAILED',
                            output: result.stdout,
                            expected: testCase.expected_output,
                            executionTime: result.time,
                            memory: result.memory,
                            error: null
                        });
                    } else if (result.status && result.status.id === 5) { // Time Limit Exceeded
                        results.push({
                            testCase: testCase,
                            status: 'TLE',
                            output: null,
                            expected: testCase.expected_output,
                            executionTime: null,
                            memory: null,
                            error: 'Time Limit Exceeded'
                        });
                    } else if (result.status && result.status.id === 6) { // Compilation Error
                        results.push({
                            testCase: testCase,
                            status: 'CE',
                            output: null,
                            expected: testCase.expected_output,
                            executionTime: null,
                            memory: null,
                            error: result.compile_output || 'Compilation Error'
                        });
                    } else {
                        results.push({
                            testCase: testCase,
                            status: 'ERROR',
                            output: null,
                            expected: testCase.expected_output,
                            executionTime: null,
                            memory: null,
                            error: result.status?.description || 'Unknown Error'
                        });
                    }
                } catch (error) {
                    results.push({
                        testCase: testCase,
                        status: 'ERROR',
                        output: null,
                        expected: testCase.expected_output,
                        executionTime: null,
                        memory: null,
                        error: error.message
                    });
                }
            }
            
            console.log('Test case execution completed. Results:', results);
            return results;
        } catch (error) {
            console.error('Error executing test cases:', error);
            throw error;
        }
    }

    /**
     * Execute code against test cases with LLM interpretation
     */
    async executeTestCasesWithLLM(code, language, testCases, problemContext = '') {
        try {
            console.log('Starting test case execution with LLM interpretation...');
            console.log('Language:', language);
            console.log('Code length:', code.length);
            console.log('Number of test cases:', testCases.length);
            
            // First, interpret all test cases using LLM
            console.log('Interpreting test cases with LLM...');
            const interpretedTestCases = await llmService.interpretTestCases(testCases, language, problemContext);
            
            console.log('LLM interpretation results:', interpretedTestCases);
            
            const results = [];
            
            for (let i = 0; i < testCases.length; i++) {
                const testCase = testCases[i];
                const interpretation = interpretedTestCases[i];
                
                try {
                    console.log(`Processing test case ${testCase.id} with LLM interpretation:`, {
                        original_input: testCase.input_data,
                        interpreted_input: interpretation.formatted_input,
                        expected_output: testCase.expected_output,
                        is_sample: testCase.is_sample,
                        interpretation_success: interpretation.success
                    });
                    
                    // Use interpreted input if available, otherwise fallback to original
                    const inputToUse = interpretation.success && interpretation.formatted_input 
                        ? interpretation.formatted_input 
                        : testCase.input_data;
                    
                    // Submit code with interpreted test case input
                    const token = await this.submitCode(code, language, inputToUse);
                    console.log(`Test case ${testCase.id} submitted, token:`, token);
                    
                    // Wait for completion
                    const result = await this.waitForSubmission(token);
                    console.log(`Test case ${testCase.id} completed:`, {
                        status_id: result.status?.id,
                        status_description: result.status?.description,
                        stdout: result.stdout,
                        stderr: result.stderr,
                        compile_output: result.compile_output
                    });
                    
                    // Check if execution was successful
                    if (result.status && result.status.id === 3) { // Accepted
                        const isCorrect = this.compareOutput(result.stdout, testCase.expected_output);
                        
                        results.push({
                            testCase: testCase,
                            status: isCorrect ? 'PASSED' : 'FAILED',
                            output: result.stdout,
                            expected: testCase.expected_output,
                            executionTime: result.time,
                            memory: result.memory,
                            error: null,
                            llmInterpretation: interpretation,
                            usedInput: inputToUse
                        });
                    } else if (result.status && result.status.id === 4) { // Wrong Answer
                        results.push({
                            testCase: testCase,
                            status: 'FAILED',
                            output: result.stdout,
                            expected: testCase.expected_output,
                            executionTime: result.time,
                            memory: result.memory,
                            error: null,
                            llmInterpretation: interpretation,
                            usedInput: inputToUse
                        });
                    } else if (result.status && result.status.id === 5) { // Time Limit Exceeded
                        results.push({
                            testCase: testCase,
                            status: 'TLE',
                            output: null,
                            expected: testCase.expected_output,
                            executionTime: null,
                            memory: null,
                            error: 'Time Limit Exceeded',
                            llmInterpretation: interpretation,
                            usedInput: inputToUse
                        });
                    } else if (result.status && result.status.id === 6) { // Compilation Error
                        results.push({
                            testCase: testCase,
                            status: 'CE',
                            output: null,
                            expected: testCase.expected_output,
                            executionTime: null,
                            memory: null,
                            error: result.compile_output || 'Compilation Error',
                            llmInterpretation: interpretation,
                            usedInput: inputToUse
                        });
                    } else {
                        results.push({
                            testCase: testCase,
                            status: 'ERROR',
                            output: null,
                            expected: testCase.expected_output,
                            executionTime: null,
                            memory: null,
                            error: result.status?.description || 'Unknown Error',
                            llmInterpretation: interpretation,
                            usedInput: inputToUse
                        });
                    }
                } catch (error) {
                    results.push({
                        testCase: testCase,
                        status: 'ERROR',
                        output: null,
                        expected: testCase.expected_output,
                        executionTime: null,
                        memory: null,
                        error: error.message,
                        llmInterpretation: interpretation,
                        usedInput: testCase.input_data
                    });
                }
            }
            
            console.log('Test case execution with LLM completed. Results:', results);
            return results;
        } catch (error) {
            console.error('Error executing test cases with LLM:', error);
            throw error;
        }
    }

    /**
     * Compare output with expected output
     */
    compareOutput(actual, expected) {
        if (!actual || !expected) return false;
        
        // Clean up whitespace and normalize line endings
        const cleanActual = actual.trim().replace(/\r\n/g, '\n');
        const cleanExpected = expected.trim().replace(/\r\n/g, '\n');
        
        return cleanActual === cleanExpected;
    }

    /**
     * Get supported languages
     */
    getSupportedLanguages() {
        return Object.keys(this.languageMap);
    }

    /**
     * Get language ID for a given language
     */
    getLanguageId(language) {
        return this.languageMap[language.toLowerCase()];
    }
}

module.exports = new Judge0Service();
