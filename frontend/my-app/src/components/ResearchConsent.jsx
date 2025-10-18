import React, { useState } from 'react';
import './ResearchConsent.css';

const ResearchConsent = ({ onConsent, onDecline }) => {
  const [consentGiven, setConsentGiven] = useState(false);
  const [prolificId, setProlificId] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (consentGiven && prolificId.trim()) {
      onConsent(prolificId.trim());
    }
  };

  return (
    <div className="research-consent">
      <div className="consent-container">
        <h2>Research Study Consent</h2>

        <div className="consent-content">
          <h3>Study Title: Self-Regulated Learning with AI Tutoring</h3>

          <div className="consent-section">
            <h4>What is this study about?</h4>
            <p>
              We are studying how AI tutoring systems can help people learn new
              skills through self-regulated learning (SRL). You will use an AI
              tutor to learn a topic of your choice (Python programming, Piano,
              or Guitar) for about 45 minutes.
            </p>
          </div>

          <div className="consent-section">
            <h4>What will you do?</h4>
            <ul>
              <li>Complete a brief pre-assessment (5 minutes)</li>
              <li>Learn using our AI tutoring system (30-35 minutes)</li>
              <li>Take quizzes to test your understanding</li>
              <li>
                Complete a post-assessment and feedback survey (10 minutes)
              </li>
            </ul>
          </div>

          <div className="consent-section">
            <h4>Data Collection</h4>
            <p>
              We will collect your learning progress, quiz scores, and feedback
              responses. Your Prolific ID will be used to link your data but
              will be anonymized in analysis.
            </p>
          </div>

          <div className="consent-section">
            <h4>Time & Compensation</h4>
            <p>
              This study takes approximately 45 minutes. You will be compensated
              according to Prolific's standard rates for studies of this
              duration.
            </p>
          </div>

          <div className="consent-section">
            <h4>Your Rights</h4>
            <p>
              Participation is voluntary. You may withdraw at any time without
              penalty. Your data will be kept confidential and used only for
              research purposes.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="consent-form">
          <div className="form-group">
            <label htmlFor="prolificId">Prolific ID (required):</label>
            <input
              type="text"
              id="prolificId"
              value={prolificId}
              onChange={(e) => setProlificId(e.target.value)}
              placeholder="Enter your Prolific ID"
              required
            />
          </div>

          <div className="consent-checkbox">
            <label>
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                required
              />
              I have read and understood the information above, and I consent to
              participate in this study.
            </label>
          </div>

          <div className="consent-buttons">
            <button type="button" onClick={onDecline} className="decline-btn">
              Decline
            </button>
            <button
              type="submit"
              disabled={!consentGiven || !prolificId.trim()}
              className="consent-btn"
            >
              I Consent - Start Study
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ResearchConsent;
