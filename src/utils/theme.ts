/**
 * Theme utility for detecting and applying Obsidian theme styles
 */

export interface ThemeColors {
    editorBackground: string;
    editorBorder: string;
    editorBoxShadow: string;
    textColor: string;
    focusShadow: string;
    focusBorderColor: string;
    backdropBackground: string;
}

/**
 * Detect if the current theme is dark mode
 */
export function isDarkTheme(): boolean {
    return document.documentElement.classList.contains('theme-dark');
}

/**
 * Get theme colors based on current Obsidian theme
 */
export function getThemeColors(): ThemeColors {
    const isDark = isDarkTheme();
    
    if (isDark) {
        return {
            editorBackground: 'rgba(40, 40, 40, 0.98)',
            editorBorder: 'rgba(200, 200, 200, 0.2)',
            editorBoxShadow: '0 12px 28px rgba(0, 0, 0, 0.5)',
            textColor: 'rgba(255, 255, 255, 0.95)',
            focusShadow: '0 0 0 4px rgba(100, 150, 255, 0.2)',
            focusBorderColor: 'rgba(100, 150, 255, 0.6)',
            backdropBackground: 'rgba(0, 0, 0, 0.6)',
        };
    } else {
        return {
            editorBackground: 'rgba(255, 255, 255, 0.98)',
            editorBorder: 'rgba(0, 0, 0, 0.12)',
            editorBoxShadow: '0 12px 28px rgba(0, 0, 0, 0.35)',
            textColor: 'rgba(0, 0, 0, 0.95)',
            focusShadow: '0 0 0 4px rgba(80, 150, 255, 0.12)',
            focusBorderColor: 'rgba(80, 150, 255, 0.5)',
            backdropBackground: 'rgba(0, 0, 0, 0.45)',
        };
    }
}

/**
 * Generate inline styles for the node editor based on current theme
 */
export function generateNodeEditorStyles(): string {
    const colors = getThemeColors();
    
    return `
        .markmap-inline-backdrop {
            position: fixed;
            inset: 0;
            background: ${colors.backdropBackground};
            z-index: 1000;
            backdrop-filter: blur(2px);
        }
        
        .markmap-inline-editor {
            position: fixed;
            z-index: 1001;
            padding: 12px;
            border-radius: 8px;
            background: ${colors.editorBackground};
            border: 1px solid ${colors.editorBorder};
            box-shadow: ${colors.editorBoxShadow};
            backdrop-filter: blur(6px);
            max-width: 90vw;
        }
        
        .markmap-inline-editor textarea {
            width: 100%;
            min-height: 44px;
            padding: 10px;
            border-radius: 6px;
            border: 1px solid ${colors.editorBorder};
            resize: vertical;
            background: transparent;
            color: ${colors.textColor};
            font-family: inherit;
            font-size: 14px;
            line-height: 1.5;
        }
        
        .markmap-inline-editor textarea:focus {
            outline: none;
            box-shadow: ${colors.focusShadow};
            border-color: ${colors.focusBorderColor};
        }
        
        .markmap-inline-editor textarea::placeholder {
            color: rgba(${isDarkTheme() ? '200, 200, 200' : '100, 100, 100'}, 0.4);
        }
    `;
}

/**
 * Watch for theme changes and execute callback
 */
export function watchThemeChanges(callback: (isDark: boolean) => void): () => void {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                callback(isDarkTheme());
            }
        });
    });

    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
    });

    // Return unobserve function
    return () => observer.disconnect();
}
