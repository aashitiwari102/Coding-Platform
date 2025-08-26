import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { contestsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface Contest {
  id: number;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  is_public: boolean;
  is_active: boolean;
  contest_type: string;
  max_participants: number;
  current_participants: number;
  problems: ContestProblem[];
}

interface ContestProblem {
  id: number;
  title: string;
  difficulty_level: string;
  points: number;
}

const ContestDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [contest, setContest] = useState<Contest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isParticipating, setIsParticipating] = useState(false);

  const fetchContest = useCallback(async () => {
    try {
      setLoading(true);
      const response = await contestsAPI.getById(id!);
      
      if (response && response.data && response.data.success) {
        setContest(response.data.contest);
        setError(null);
      } else {
        console.error('Unexpected contest API response format:', response);
        setError('Received unexpected data format from API');
      }
    } catch (err) {
      console.error('Error fetching contest:', err);
      setError('Failed to fetch contest details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchContest();
    }
  }, [id, fetchContest]);

  const getContestStatus = (startTime: string, endTime: string): 'upcoming' | 'ongoing' | 'ended' => {
    const now = new Date();
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (now < start) return 'upcoming';
    if (now >= start && now <= end) return 'ongoing';
    return 'ended';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'upcoming': return 'text-blue-600 bg-blue-100';
      case 'ongoing': return 'text-green-600 bg-green-100';
      case 'ended': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case 'easy': return 'text-green-600 bg-green-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'hard': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const handleRegister = async () => {
    if (!user) {
      alert('Please log in to register for contests');
      return;
    }

    try {
      setIsParticipating(true);
      await contestsAPI.register(id!);
      setIsRegistered(true);
      alert('Successfully registered for contest!');
    } catch (err: any) {
      console.error('Registration error:', err);
      alert(err.response?.data?.message || 'Failed to register for contest');
    } finally {
      setIsParticipating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !contest) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Contest Not Found</h2>
          <p className="text-gray-600 mb-4">{error || 'The contest you are looking for does not exist.'}</p>
          <button 
            onClick={() => navigate('/contests')}
            className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition-colors"
          >
            Back to Contests
          </button>
        </div>
      </div>
    );
  }

  const status = getContestStatus(contest.start_time, contest.end_time);
  const canRegister = status === 'upcoming' && !isRegistered;
  const canParticipate = status === 'ongoing' && isRegistered;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Contest Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{contest.title}</h1>
              <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                <span className={`px-3 py-1 rounded-full font-medium ${getStatusColor(status)}`}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </span>
                <span className={`px-3 py-1 rounded-full font-medium ${contest.is_public ? 'text-green-600 bg-green-100' : 'text-purple-600 bg-purple-100'}`}>
                  {contest.is_public ? 'Public' : 'Private'}
                </span>
                <span className="px-3 py-1 rounded-full font-medium bg-blue-100 text-blue-600">
                  {contest.contest_type}
                </span>
              </div>
              <p className="text-gray-700 mb-4">{contest.description}</p>
            </div>
            <button
              onClick={() => navigate('/contests')}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-primary-600 bg-white border border-primary-300 rounded-lg hover:bg-primary-50 hover:text-primary-700 hover:border-primary-400 transition-colors duration-200 ml-4"
            >
              <span className="mr-1">←</span> Back to Contests
            </button>
          </div>

          {/* Contest Info Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{formatDate(contest.start_time)}</div>
              <div className="text-sm text-gray-600">Start Time</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{formatDate(contest.end_time)}</div>
              <div className="text-sm text-gray-600">End Time</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{formatDuration(contest.duration_minutes)}</div>
              <div className="text-sm text-gray-600">Duration</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{contest.current_participants}/{contest.max_participants}</div>
              <div className="text-sm text-gray-600">Participants</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex gap-4">
            {canRegister && (
              <button
                onClick={handleRegister}
                disabled={isParticipating}
                className="bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {isParticipating ? 'Registering...' : 'Register for Contest'}
              </button>
            )}
            {canParticipate && (
              <button
                onClick={() => navigate(`/contests/${contest.id}/problems`)}
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
              >
                View Problems
              </button>
            )}
            {isRegistered && status === 'upcoming' && (
              <span className="px-4 py-2 bg-green-100 text-green-800 rounded-lg">
                ✓ Registered
              </span>
            )}
          </div>
        </div>

        {/* Contest Problems */}
        {contest.problems && contest.problems.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Contest Problems</h2>
            <div className="grid gap-4">
              {contest.problems.map((problem) => (
                <div key={problem.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <div className="flex items-center space-x-4">
                    <div className="text-lg font-medium text-gray-900">{problem.title}</div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(problem.difficulty_level)}`}>
                      {problem.difficulty_level}
                    </span>
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-600">
                      {problem.points} pts
                    </span>
                  </div>
                  {canParticipate && (
                    <button
                      onClick={() => navigate(`/problems/${problem.id}`)}
                      className="text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Solve →
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {(!contest.problems || contest.problems.length === 0) && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
            <div className="text-gray-400 text-6xl mb-4">📝</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No problems assigned yet</h3>
            <p className="text-gray-600">Problems will be available when the contest starts.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContestDetail;
