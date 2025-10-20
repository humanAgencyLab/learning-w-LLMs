'use client';
import React from 'react';
import styles from './InputDesign.module.css';
import StatusBar from './StatusBar';
import EmailIcon from './EmailIcon';
import LockIcon from './LockIcon';
import InputField from './InputField';
import SignUpPrompt from './SignUpPrompt';

function InputDesign() {
  return (
    <>
      {/* Fonts loaded via Tailwind CSS configuration */}
      <main className={styles.container}>
        <header className={styles.statusBar}>
          <StatusBar />
        </header>

        <figure className={styles.logoContainer}>
          <img
            src="/icons/logo.svg"
            alt="AI Study Assistant Logo"
            className={styles.logo}
          />
        </figure>

        <h1 className={styles.heading}>Welcome Back!</h1>

        <form>
          <InputField type="email" placeholder="Email" icon={<EmailIcon />} />

          <InputField
            type="password"
            placeholder="Password"
            icon={<LockIcon />}
          />

          <button type="submit" className={styles.signInButton}>
            Sign In
          </button>
        </form>

        <SignUpPrompt />
      </main>
    </>
  );
}

export default InputDesign;
