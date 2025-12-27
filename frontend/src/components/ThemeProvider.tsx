"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

type ThemeContextType = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialize from existing DOM class (set by inline script) to prevent flicker
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    return 'dark';
  });

  // Hydrate theme from localStorage on mount (only update if different)
  useEffect(() => {
    try {
      const stored = localStorage.getItem("woco.theme") as Theme | null;
      if (stored === "light" || stored === "dark") {
        setTheme(stored);
      }
    } catch {
      // Ignore localStorage errors (private browsing, etc.)
    }
  }, []); // Run only once on mount

  // Apply theme to document whenever it changes (only if actually different)
  useEffect(() => {
    const root = document.documentElement;
    const isDark = root.classList.contains('dark');
    const shouldBeDark = theme === 'dark';

    if (shouldBeDark && !isDark) {
      root.classList.add("dark");
    } else if (!shouldBeDark && isDark) {
      root.classList.remove("dark");
    }

    try {
      localStorage.setItem("woco.theme", theme);
    } catch {
      // Ignore localStorage errors
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
