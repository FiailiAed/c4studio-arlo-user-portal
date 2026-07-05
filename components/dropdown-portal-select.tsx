"use client";

import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { useState } from "react";

export function DropdownPortalSelect() {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState("Select Portal");

  const portals = ["Admin", "Players", "Referee", "Coach", "Program"];

  const handleSelect = (portal: string) => {
      setSelected(portal);
      setIsOpen(false);
      window.open(`/${portal.toLowerCase()}`, "_parent");
  };

  return (
    <div className="flex flex-col w-44 text-sm relative">
        <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full text-left px-4 pr-2 py-2 border rounded bg-white text-gray-800 border-gray-300 shadow-sm hover:bg-gray-50 focus:outline-none" >
            <span>{selected}</span>
            <svg className={`w-5 h-5 inline float-right transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#6B7280" >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
        </button>

        {isOpen && (
            <ul className="w-full bg-white border border-gray-300 rounded shadow-md mt-1 py-2 mb-[-10rem]">
                {portals.map((portal) => (
                    <li key={portal} className="px-4 py-2 hover:bg-linear-22 from-slate-700 to-slate-900 hover:text-white cursor-pointer" onClick={() => handleSelect(portal)} >
                        <a href={`/${portal.toLowerCase()}`}>{portal}</a>
                    </li>
                ))}
            </ul>
        )}
    </div>
  );
}
