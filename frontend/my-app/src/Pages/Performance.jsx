import React from 'react';
import MainLayout from '../layouts/MainLayout';
import '../styles/Performance.css';

function Performance() {
  return (
    <MainLayout>
      <div className="performance-page">
        {/* Accuracy Rate */}
        <div className="card accuracy-card">
          <h2>Accuracy Rate</h2>
          <div className="circle-container">
            <div className="circle-chart">
              {/* Can use SVG to access */}
              <div className="circle-fill" style={{ width: '75%' }}></div>
            </div>
            <div className="accuracy-text">75%</div>
          </div>
        </div>

        {/* Recent Session Scores */}
        <div className="card">
          <h2>Recent Session Scores</h2>
          <ul className="scores-list">
            <li>Session 1: 80%</li>
            <li>Session 2: 70%</li>
            <li>Session 3: 98%</li>
          </ul>
        </div>

        {/* Focus Areas */}
        <div className="card">
          <h2>Recommended Focus Areas</h2>
          <ul>
            <li>Biology</li>
            <li>Chemistry</li>
            <li>Physics</li>
          </ul>
        </div>

        {/* Strengths & Weaknesses */}
        <div className="card strengths-weaknesses">
          <h2>Strengths & Weaknesses</h2>
          <div className="flex-row">
            <div>
              <h4>Strengths</h4>
              <ul>
                <li>Logical Reasoning</li>
                <li>Vocabulary</li>
              </ul>
            </div>
            <div>
              <h4>Weaknesses</h4>
              <ul>
                <li>Reading Speed</li>
                <li>Grammar</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

export default Performance;
