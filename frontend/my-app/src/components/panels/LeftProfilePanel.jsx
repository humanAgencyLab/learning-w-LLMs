import React from 'react';

export default function LeftProfilePanel() {
  return (
    <div className="bg-surface border-r border-border flex flex-col h-full">
      {/* Header */}
      <div className="flex gap-2 items-center pl-4 pr-9 py-4 shrink-0">
        <div className="relative shrink-0 size-10">
          <div className="absolute left-1/2 size-8 top-1/2 translate-x-[-50%] translate-y-[-50%]">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">S</span>
            </div>
          </div>
        </div>
        <p className="font-bold leading-7 text-lg text-text tracking-[-0.4px]">
          Study Assist
        </p>
      </div>

      {/* Navigation */}
      <div className="flex flex-col gap-2 items-start shrink-0">
        <div className="flex gap-4 h-10 items-center px-4 py-2 rounded-lg w-full hover:bg-neutral-50 cursor-pointer">
          <div className="relative shrink-0 size-6">
            <svg className="w-6 h-6 text-text" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
            </svg>
          </div>
          <p className="font-normal leading-5 text-base text-text tracking-[-0.25px]">
            New Chat
          </p>
        </div>

        <div className="flex gap-4 h-10 items-center px-4 py-2 rounded-lg w-full hover:bg-neutral-50 cursor-pointer">
          <div className="relative shrink-0 size-6">
            <svg className="w-6 h-6 text-text" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
            </svg>
          </div>
          <p className="font-normal leading-5 text-base text-text tracking-[-0.25px]">
            Chat History
          </p>
        </div>

        <div className="flex gap-4 h-10 items-center px-4 py-2 rounded-lg w-full hover:bg-neutral-50 cursor-pointer">
          <div className="relative shrink-0 size-6">
            <svg className="w-6 h-6 text-text" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.82,11.69,4.82,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
            </svg>
          </div>
          <p className="font-normal leading-5 text-base text-text tracking-[-0.25px]">
            Settings
          </p>
        </div>

        <div className="flex gap-4 h-10 items-center px-4 py-2 rounded-lg w-full hover:bg-neutral-50 cursor-pointer">
          <div className="relative shrink-0 size-6">
            <svg className="w-6 h-6 text-text" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
            </svg>
          </div>
          <p className="font-normal leading-5 text-base text-text tracking-[-0.25px]">
            Performance
          </p>
        </div>

        <div className="flex gap-4 h-10 items-center px-4 py-2 rounded-lg w-full hover:bg-neutral-50 cursor-pointer">
          <div className="relative shrink-0 size-6">
            <svg className="w-6 h-6 text-text" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2zm-5 12l-2.5-1.5L7 15V5h10v10l-2.5 1.5L12 15z"/>
            </svg>
          </div>
          <p className="font-normal leading-5 text-base text-text tracking-[-0.25px]">
            Favourites
          </p>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Profile */}
      <div className="flex gap-2 items-center p-4 shrink-0">
        <div className="relative shrink-0 size-10">
          <img 
            alt="" 
            className="block max-w-none size-full rounded-full" 
            src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=40&h=40&fit=crop&crop=face" 
          />
        </div>
        <div className="flex gap-1 items-center">
          <p className="font-normal leading-6 text-base text-text tracking-[-0.25px]">
            John Smith
          </p>
          <div className="overflow-clip relative shrink-0 size-4">
            <svg className="w-4 h-4 text-text" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}