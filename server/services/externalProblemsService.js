const { PythonShell } = require('python-shell');
const path = require('path');
const database = require('../database/connection');

class ExternalProblemsService {
    constructor() {
        this.scriptPath = path.join(__dirname, '..', 'scripts', 'leetscrape_script.py');
    }

    /**
     * Fetch problems from external sources using Python script
     */
    async fetchExternalProblems() {
        return new Promise((resolve, reject) => {
            const options = {
                mode: 'json',
                pythonPath: 'py', // Use py launcher on Windows
                pythonOptions: ['-3.11', '-u'], // Specify Python 3.11 and unbuffered output
                scriptPath: path.dirname(this.scriptPath),
                args: []
            };

            PythonShell.run(path.basename(this.scriptPath), options, (err, results) => {
                if (err) {
                    console.error('Python script error:', err);
                    reject(new Error(`Failed to run Python script: ${err.message}`));
                    return;
                }

                if (!results || results.length === 0) {
                    reject(new Error('No results from Python script'));
                    return;
                }

                try {
                    const result = results[results.length - 1]; // Get last result
                    if (result.success) {
                        resolve(result.problems);
                    } else {
                        reject(new Error(result.error || 'Unknown error from Python script'));
                    }
                } catch (parseError) {
                    reject(new Error(`Failed to parse Python script results: ${parseError.message}`));
                }
            });
        });
    }

    /**
     * Sync external problems to database
     */
    async syncProblemsToDatabase() {
        try {
            console.log('Fetching LeetCode problems using leetscrape...');
            const problems = await this.fetchExternalProblems();
            
            console.log(`Found ${problems.length} problems to sync`);
            
            let syncedCount = 0;
            let updatedCount = 0;
            let errorCount = 0;

            for (const problem of problems) {
                try {
                    // Check if problem already exists
                    const existingProblem = await database.get(
                        'SELECT id FROM problems WHERE source_platform = ? AND source_problem_id = ?',
                        [problem.source_platform, problem.source_problem_id]
                    );

                    // Prepare data - ensure topic_tags and examples are JSON strings
                    const topicTags = Array.isArray(problem.topic_tags) ? JSON.stringify(problem.topic_tags) : '[]';
                    const examples = Array.isArray(problem.examples) ? JSON.stringify(problem.examples) : '[]';
                    const testCases = Array.isArray(problem.test_cases) ? problem.test_cases : [];

                    if (existingProblem) {
                        // Update existing problem
                        await database.run(
                            `UPDATE problems SET 
                                title = ?, description = ?, difficulty_level = ?, topic_tags = ?,
                                problem_statement = ?, input_format = ?, output_format = ?,
                                constraints = ?, examples = ?, hints = ?, updated_at = CURRENT_TIMESTAMP
                             WHERE source_platform = ? AND source_problem_id = ?`,
                            [
                                problem.title,
                                problem.problem_statement,
                                problem.difficulty_level,
                                topicTags,
                                problem.problem_statement,
                                problem.input_format,
                                problem.output_format,
                                problem.constraints,
                                examples,
                                problem.hints,
                                problem.source_platform,
                                problem.source_problem_id
                            ]
                        );

                        // Update test cases
                        await this.syncTestCases(existingProblem.id, testCases);
                        updatedCount++;
                    } else {
                        // Insert new problem
                        const result = await database.run(
                            `INSERT INTO problems (
                                title, description, difficulty_level, topic_tags, time_limit_ms,
                                memory_limit_mb, source_platform, source_problem_id,
                                problem_statement, input_format, output_format, constraints,
                                examples, hints, is_active, created_at, updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                            [
                                problem.title,
                                problem.problem_statement,
                                problem.difficulty_level,
                                topicTags,
                                problem.time_limit_ms || 1000,
                                problem.memory_limit_mb || 256,
                                problem.source_platform,
                                problem.source_problem_id,
                                problem.problem_statement,
                                problem.input_format,
                                problem.output_format,
                                problem.constraints,
                                examples,
                                problem.hints,
                                true
                            ]
                        );

                        // Insert test cases
                        await this.syncTestCases(result.lastID, testCases);
                        syncedCount++;
                    }
                } catch (error) {
                    console.error(`Error syncing problem ${problem.title}:`, error);
                    errorCount++;
                }
            }

            return {
                success: true,
                synced: syncedCount,
                updated: updatedCount,
                errors: errorCount,
                total: problems.length,
                source: 'LeetCode via leetscrape'
            };

        } catch (error) {
            console.error('Error syncing problems:', error);
            throw error;
        }
    }

    /**
     * Sync test cases for a problem
     */
    async syncTestCases(problemId, testCases) {
        try {
            if (!testCases || testCases.length === 0) {
                return;
            }

            // Remove existing test cases for this problem
            await database.run('DELETE FROM test_cases WHERE problem_id = ?', [problemId]);

            // Insert new test cases
            for (const testCase of testCases) {
                await database.run(
                    `INSERT INTO test_cases (
                        problem_id, input_data, expected_output, is_sample, 
                        test_case_group, created_at
                    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                    [
                        problemId,
                        testCase.input || '',
                        testCase.output || '',
                        testCase.is_sample || false,
                        testCase.explanation ? 'explanation' : 'standard'
                    ]
                );
            }

            console.log(`Synced ${testCases.length} test cases for problem ${problemId}`);
        } catch (error) {
            console.error(`Error syncing test cases for problem ${problemId}:`, error);
            throw error;
        }
    }

    /**
     * Get all available topics from problems
     */
    async getAvailableTopics() {
        try {
            const result = await database.all(
                'SELECT DISTINCT topic_tags FROM problems WHERE topic_tags IS NOT NULL AND topic_tags != ""'
            );
            
            const allTags = new Set();
            result.forEach(row => {
                try {
                    const tags = JSON.parse(row.topic_tags);
                    if (Array.isArray(tags)) {
                        tags.forEach(tag => allTags.add(tag));
                    }
                } catch (e) {
                    // Skip invalid JSON
                }
            });
            
            return Array.from(allTags).sort();
        } catch (error) {
            console.error('Error getting topics:', error);
            return [];
        }
    }

    /**
     * Get problems with filtering
     */
    async getProblems(filters = {}) {
        try {
            const {
                page = 1,
                limit = 20,
                difficulty,
                topics,
                search
            } = filters;

            const offset = (page - 1) * limit;
            const conditions = ['is_active = 1'];
            const params = [];

            if (difficulty) {
                conditions.push('difficulty_level = ?');
                params.push(difficulty);
            }

            if (topics && topics.length > 0) {
                // Create JSON array pattern for each topic
                const topicConditions = topics.map(() => 'JSON_EXTRACT(topic_tags, "$") LIKE ?');
                conditions.push(`(${topicConditions.join(' OR ')})`);                topics.forEach(topic => params.push(`%"${topic}"%`));
                console.log('Topic filter conditions:', topicConditions);
                console.log('Topic filter params:', params);
            }

            if (search) {
                conditions.push('(title LIKE ? OR description LIKE ?)');
                params.push(`%${search}%`, `%${search}%`);
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

            // Get total count
            const countQuery = `SELECT COUNT(*) as total FROM problems ${whereClause}`;
            const countResult = await database.get(countQuery, params);
            const total = countResult.total;

            // Get problems
            const problemsQuery = `
                SELECT id, title, description, difficulty_level, topic_tags, source_platform,
                       source_problem_id, created_at, time_limit_ms, memory_limit_mb
                FROM problems 
                ${whereClause}
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            `;

            const problems = await database.all(problemsQuery, [...params, parseInt(limit), offset]);

            // Parse topic tags
            problems.forEach(problem => {
                try {
                    problem.topic_tags = JSON.parse(problem.topic_tags);
                } catch (e) {
                    problem.topic_tags = [];
                }
            });

            return {
                success: true,
                problems,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            };

        } catch (error) {
            console.error('Error getting problems:', error);
            throw error;
        }
    }
}

module.exports = new ExternalProblemsService();
