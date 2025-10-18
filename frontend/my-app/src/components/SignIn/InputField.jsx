import React from 'react';
import styles from './InputDesign.module.css';

const InputField = ({ type, placeholder, icon }) => {
  return (
    <div className={styles.inputContainer}>
      <div className={styles.iconWrapper}>{icon}</div>
      <input
        type={type}
        placeholder={placeholder}
        className={styles.input}
        aria-label={placeholder}
      />
    </div>
  );
};

export default InputField;
