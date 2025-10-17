"use client";

import Link from "next/link";
import React from "react";

const CreateTokenButton = () => {
  return (
    <Link
      href="/launch"
      className="flex items-center cursor-pointer gap-2 bg-[#A770FF] text-white px-6 py-3 rounded-lg font-medium hover:bg-[#A770FF]/90 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
    >
      <svg
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 6v6m0 0v6m0-6h6m-6 0H6"
        />
      </svg>
      Create a Token
    </Link>
  );
};

export default CreateTokenButton;
