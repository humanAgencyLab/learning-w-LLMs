import { Link } from 'react-router-dom';
import React from 'react';
import styles from './InputDesign.module.css';

const SignUpPrompt = () => {
  return (
    <p className={styles.signUpPrompt}>
      Don't have an account?
      <Link to="/signup" className={styles.span}>
        {' '}
        Sign Up{' '}
      </Link>
    </p>
  );
};

export default SignUpPrompt;
