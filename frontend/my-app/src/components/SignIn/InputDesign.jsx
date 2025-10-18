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
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@600;700&display=swap"
        rel="stylesheet"
      />
      <main className={styles.container}>
        <header className={styles.statusBar}>
          <StatusBar />
        </header>

        <figure className={styles.logoContainer}>
          <img
            src="https://cdn.builder.io/api/v1/image/assets/TEMP/470cd0ebfc3f50115546b5467b96ef7fc85731dc?placeholderIfAbsent=true"
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
