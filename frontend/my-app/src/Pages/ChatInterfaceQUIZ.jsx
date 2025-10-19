import React, { useState } from 'react';
import '../styles/ChatInterfaceQUIZ.css';

function ChatInterfaceQUIZ() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [quizAnswered, setQuizAnswered] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (inputValue.trim() === '') return;
    // Add user message to chat
    // array of messages
    setMessages([...messages, { text: inputValue, sender: 'user' }]);
    setInputValue('');

    // fake AI message - replace with actual AI response logic after
    setTimeout(() => {
      const aiMessage1 = { text: 'This is a test AI response!', sender: 'ai' };
      setMessages((prevMessages) => [...prevMessages, aiMessage1]);
    }, 800); // 800ms delay to simulate thinking

    setTimeout(() => {
      setQuizAnswered(false); // reset quizAnswered for new quiz
      // fake AI quiz message - replace with actual AI response logic after
      const aiQuiz = {
        sender: 'ai',
        type: 'quiz',
        question: 'what is 2+2?',
        options: ['9', '2', '4', '8'],
        correctAnswer: '4',
      };
      setMessages((prevMessages) => [...prevMessages, aiQuiz]);
    }, 2000); // 2000ms delay to simulate quiz
  };

  const handleAnswer = (option, correctAnswer) => {
    if (quizAnswered) return;
    setQuizAnswered(true);

    const isCorrect = option === correctAnswer;
    //different response if user is right/wrong
    const response = isCorrect
      ? `You answered ${option}. Correct!`
      : `You answered ${option}. Incorrect. The correct answer is ${correctAnswer}`;

    setMessages((prevMessages) => [
      ...prevMessages,
      { text: response, sender: 'ai' },
    ]);
  };

  return (
    <div className="chat-container">
        <h1 className="chat-header">AI Study Assistant</h1>

        <div className="chat-box">
          <div className="message user-message">
            Hey, can you help me with logic problems?
          </div>

          <div className="message ai-message">
            Sure! I’d be happy to help you with logic problems.
          </div>

          {messages.map((message, index) => (
            <div key={index} className={`message ${message.sender}-message`}>
              {message.type === 'quiz' ? (
                <div>
                  <strong>{message.question}</strong>
                  <div>
                    {message.options.map((opt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleAnswer(opt, message.correctAnswer)}
                        className={`quiz-option ${quizAnswered ? 'disabled-option' : ''}`}
                        disabled={quizAnswered}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                message.text
              )}
            </div>
          ))}
        </div>

        <div className="message-input-wrapper">
          <input
            type="text"
            placeholder="Type your message..."
            className="message-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <button className="send-button" type="submit" onClick={handleSubmit}>
            →
          </button>
        </div>
      </div>
  );
}

export default ChatInterfaceQUIZ;
