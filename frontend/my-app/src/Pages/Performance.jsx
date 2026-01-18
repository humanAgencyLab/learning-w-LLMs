import React, { useState, useEffect } from 'react';
import '../styles/Performance.css';
import { getPerformanceData, exportPerformanceData } from '../lib/performanceApi';
import { toastBus } from '../components/ui/toast';
import CollapsibleSection from '../components/performance/CollapsibleSection';
import LineChart from '../components/performance/LineChart';
import BarChart from '../components/performance/BarChart';
import ComparativeBarChart from '../components/performance/ComparativeBarChart';

function Performance() {
  const [performanceData, setPerformanceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadPerformanceData();
  }, []);

  const loadPerformanceData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getPerformanceData();
      if (response.success && response.data) {
        setPerformanceData(response.data);
      } else {
        throw new Error('Failed to load performance data');
      }
    } catch (err) {
      console.error('Error loading performance data:', err);
      setError(err.message);
      toastBus.publish({
        type: 'error',
        message: 'Failed to load performance data. Please try again later.'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      await exportPerformanceData();
      toastBus.publish({
        type: 'success',
        message: 'Performance data exported successfully!'
      });
    } catch (err) {
      console.error('Error exporting data:', err);
      toastBus.publish({
        type: 'error',
        message: 'Failed to export performance data. Please try again.'
      });
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="performance-page">
        <div className="performance-loading">
          <div className="loading-spinner"></div>
          <p>Loading performance data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="performance-page">
        <div className="performance-error">
          <p>Error: {error}</p>
          <button onClick={loadPerformanceData} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!performanceData) {
    return (
      <div className="performance-page">
        <div className="performance-empty">
          <p>No performance data available yet. Start learning to see your progress!</p>
        </div>
      </div>
    );
  }

  const {
    accuracyRate = 0,
    minutesSpent = 0,
    quizScores = {},
    moduleCompletion = {},
    studyPlanScores = {},
    revisionScores = {},
    sessionStats = {},
    activityStreak = {},
    topicDistribution = [],
    comparative = {},
    timeTrends = {},
    phaseFunnel = {},
    assessmentMetrics = {},
    quizRetryRate = {},
    learningModeComparison = {},
    difficultyPerformance = {},
    learningEfficiency = {},
    phaseTimeBreakdown = {},
    sessionDurationAnalytics = {}
  } = performanceData;

  const accuracyPercentage = accuracyRate || quizScores.average || 0;
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (accuracyPercentage / 100) * circumference;

  const formatMinutes = (minutes) => {
    if (minutes < 60) return `${minutes} min`;
    
    const totalMinutes = minutes;
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const mins = totalMinutes % 60;
    
    if (days > 0) {
      return `${days}d ${hours}h ${mins}m`;
    } else if (hours > 0) {
      return `${hours}h ${mins}m`;
    } else {
      return `${mins}m`;
    }
  };

  // Prepare chart data
  const weeklyTrendData = (timeTrends.weekly || []).map(w => ({
    label: w.week,
    value: w.avgScore
  }));

  const phaseFunnelData = (phaseFunnel.funnel || []).map(f => ({
    label: f.phase.charAt(0).toUpperCase() + f.phase.slice(1),
    value: f.percentage
  }));

  // Comparative data for charts
  const comparativeData = comparative?.comparison ? [
    { label: 'Quiz Score', user: comparative.comparison.quizScore?.user || 0, platform: comparative.comparison.quizScore?.platform || 0 },
    { label: 'Accuracy', user: comparative.comparison.accuracy?.user || 0, platform: comparative.comparison.accuracy?.platform || 0 },
    { label: 'Module Completion', user: comparative.comparison.moduleCompletion?.user || 0, platform: comparative.comparison.moduleCompletion?.platform || 0 },
    { label: 'Sessions', user: comparative.comparison.sessionsCompleted?.user || 0, platform: comparative.comparison.sessionsCompleted?.platform || 0 }
  ] : [];


  // Difficulty performance for bar chart
  const difficultyBarData = difficultyPerformance ? [
    { label: 'Intro', value: difficultyPerformance.intro?.completionRate || 0 },
    { label: 'Core', value: difficultyPerformance.core?.completionRate || 0 },
    { label: 'Apply', value: difficultyPerformance.apply?.completionRate || 0 },
    { label: 'Challenge', value: difficultyPerformance.challenge?.completionRate || 0 }
  ] : [];

  // Learning mode comparison for bar chart
  const modeBarData = learningModeComparison ? [
    { label: 'Studying', value: learningModeComparison.studying?.avgScore || 0 },
    { label: 'Reviewing', value: learningModeComparison.reviewing?.avgScore || 0 },
    { label: 'Testing', value: learningModeComparison.testing?.avgScore || 0 }
  ] : [];

  return (
    <div className="performance-page">
      <div className="performance-header">
        <div>
          <h1 className="page-title">Performance Dashboard</h1>
          <p className="page-subtitle">Track your learning progress and achievements</p>
        </div>
        <button 
          onClick={handleExport} 
          className="export-button highlight-export"
          disabled={exporting}
          title="Export all performance data as CSV"
        >
          {exporting ? '⏳ Exporting...' : '📥 Export CSV Data'}
        </button>
      </div>

      {/* Always Visible - Key Metrics */}
      <div className="key-metrics-section">
        <div className="key-metrics-grid">
          <div className="key-metric-card accuracy">
            <div className="key-metric-icon">🎯</div>
            <div className="key-metric-value">{accuracyPercentage}%</div>
            <div className="key-metric-label">Accuracy Rate</div>
          </div>
          <div className="key-metric-card time">
            <div className="key-metric-icon">⏱️</div>
            <div className="key-metric-value">{formatMinutes(minutesSpent)}</div>
            <div className="key-metric-label">Study Time</div>
          </div>
          <div className="key-metric-card modules">
            <div className="key-metric-icon">📚</div>
            <div className="key-metric-value">
              {moduleCompletion.completed || 0}/{moduleCompletion.total || 0}
            </div>
            <div className="key-metric-label">Modules Completed</div>
          </div>
          <div className="key-metric-card streak">
            <div className="key-metric-icon">🔥</div>
            <div className="key-metric-value">{activityStreak.currentStreak || 0}</div>
            <div className="key-metric-label">Day Streak</div>
          </div>
          <div className="key-metric-card quiz">
            <div className="key-metric-icon">📝</div>
            <div className="key-metric-value">{quizScores.average || 0}%</div>
            <div className="key-metric-label">Quiz Average</div>
          </div>
          <div className="key-metric-card sessions">
            <div className="key-metric-icon">📊</div>
            <div className="key-metric-value">{sessionStats.completed || 0}</div>
            <div className="key-metric-label">Sessions Completed</div>
          </div>
        </div>
      </div>

      {/* Collapsible Sections */}
      <div className="analytics-sections">
        {/* Comparative Analytics - Always Expanded */}
        {comparative && Object.keys(comparative).length > 0 && (
          <CollapsibleSection title="You vs Platform Average" icon="📊" defaultExpanded={true}>
            <div className="section-content">
              <div className="chart-container">
                <h4 className="chart-title">Performance Comparison</h4>
                {comparativeData.length > 0 ? (
                  <ComparativeBarChart data={comparativeData} width={800} height={300} />
                ) : (
                  <div className="chart-empty">No comparison data available</div>
                )}
              </div>
              <div className="percentile-badges">
                {comparative.percentiles && (
                  <>
                    <div className="percentile-badge">
                      <span className="badge-label">Quiz Score</span>
                      <span className="badge-value">Top {100 - (comparative.percentiles.quizScore || 50)}%</span>
                    </div>
                    <div className="percentile-badge">
                      <span className="badge-label">Accuracy</span>
                      <span className="badge-value">Top {100 - (comparative.percentiles.accuracy || 50)}%</span>
                    </div>
                    <div className="percentile-badge">
                      <span className="badge-label">Time Spent</span>
                      <span className="badge-value">Top {100 - (comparative.percentiles.timeSpent || 50)}%</span>
                    </div>
                    <div className="percentile-badge">
                      <span className="badge-label">Modules</span>
                      <span className="badge-value">Top {100 - (comparative.percentiles.moduleCompletion || 50)}%</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </CollapsibleSection>
        )}

        {/* Revision Performance Section */}
        <CollapsibleSection title="Revision Performance" icon="📝" defaultExpanded={true}>
          <div className="section-content">
            <div className="chart-container">
              <h4 className="chart-title">Quiz Metrics Overview</h4>
              <div className="quiz-metrics-chart">
                <BarChart 
                  data={[
                    { label: 'Avg Score', value: quizScores.average || 0 },
                    { label: 'Pass Rate', value: quizScores.passRate || 0 },
                    { label: 'First Try Pass', value: quizRetryRate.firstAttemptPassRate || 0 }
                  ]} 
                  width={600} 
                  height={200}
                  color="#4e81ee"
                />
              </div>
            </div>
            <div className="metrics-row compact">
              <div className="metric-box">
                <div className="metric-box-value">{quizScores.totalQuizzes || 0}</div>
                <div className="metric-box-label">Total Quizzes</div>
              </div>
              <div className="metric-box">
                <div className="metric-box-value">{quizRetryRate.avgAttemptsPerQuiz || 0}</div>
                <div className="metric-box-label">Avg Attempts</div>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Performance Trends Section */}
        <CollapsibleSection title="Performance Trends" icon="📈">
          <div className="section-content">
            <div className="chart-container">
              <h4 className="chart-title">Weekly Performance Trend</h4>
              {weeklyTrendData.length > 0 ? (
                <LineChart data={weeklyTrendData} width={800} height={250} />
              ) : (
                <div className="chart-empty">No trend data available yet</div>
              )}
            </div>
          </div>
        </CollapsibleSection>

        {/* Module & Milestone Progress Section */}
        <CollapsibleSection title="Module & Milestone Progress" icon="📚">
          <div className="section-content">
            <div className="progress-details">
              <div className="progress-item">
                <div className="progress-header">
                  <span>Module Completion</span>
                  <span className="progress-percentage">{moduleCompletion.completionRate || 0}%</span>
                </div>
                <div className="progress-bar-container">
                  <div 
                    className="progress-bar-fill" 
                    style={{ width: `${moduleCompletion.completionRate || 0}%` }}
                  ></div>
                </div>
                <div className="progress-stats">
                  {moduleCompletion.completed || 0} of {moduleCompletion.total || 0} modules completed
                </div>
              </div>
              <div className="progress-item">
                <div className="progress-header">
                  <span>Milestone Completion</span>
                  <span className="progress-percentage">
                    {moduleCompletion.milestones?.completionRate || 0}%
                  </span>
                </div>
                <div className="progress-bar-container">
                  <div 
                    className="progress-bar-fill" 
                    style={{ width: `${moduleCompletion.milestones?.completionRate || 0}%` }}
                  ></div>
                </div>
                <div className="progress-stats">
                  {moduleCompletion.milestones?.completed || 0} of {moduleCompletion.milestones?.total || 0} milestones completed
                </div>
              </div>
            </div>
          </div>
        </CollapsibleSection>


        {/* Learning Efficiency Section */}
        <CollapsibleSection title="Learning Efficiency" icon="⚡">
          <div className="section-content">
            <div className="section-description">
              <p>Your progress compared to platform average based on milestones and topics completed.</p>
            </div>
            <div className="chart-container">
              <h4 className="chart-title">Milestone & Topic Completion Trend</h4>
              {weeklyTrendData.length > 0 ? (
                <div style={{ marginBottom: '20px' }}>
                  <LineChart data={weeklyTrendData} width={800} height={250} />
                  <div style={{ marginTop: '16px', display: 'flex', gap: '16px', justifyContent: 'center' }}>
                    <div style={{ fontSize: '14px', color: '#666' }}>
                      <strong>Your Milestones:</strong> {moduleCompletion.milestones?.completed || 0} / {moduleCompletion.milestones?.total || 0}
                    </div>
                    <div style={{ fontSize: '14px', color: '#999' }}>
                      Platform Avg: ~{Math.floor((moduleCompletion.milestones?.total || 0) * 0.6)} milestones
                    </div>
                  </div>
                </div>
              ) : (
                <div className="chart-empty">No trend data available yet. Complete some milestones to see your progress!</div>
              )}
            </div>
          </div>
        </CollapsibleSection>


      </div>
    </div>
  );
}

export default Performance;
