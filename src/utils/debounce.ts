export function debounce<T extends (...args: unknown[]) => unknown>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    return function (...args: Parameters<T>): void {
        const later = () => {
            timeout = null;
            func(...args);
        };

        if (timeout !== null) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(later, wait);
    };
}

export function throttle<T extends (...args: unknown[]) => unknown>(
    func: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle = false;

    return function (...args: Parameters<T>): void {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => {
                inThrottle = false;
            }, limit);
        }
    };
}

export class Debouncer {
    private timeout: ReturnType<typeof setTimeout> | null = null;
    private wait: number;

    constructor(wait: number) {
        this.wait = wait;
    }

    debounce<T extends (...args: any[]) => void>(func: T): (...args: Parameters<T>) => void {
        const debounced = (...args: Parameters<T>) => {
            if (this.timeout !== null) {
                clearTimeout(this.timeout);
            }
            this.timeout = setTimeout(() => {
                this.timeout = null;
                func(...args);
            }, this.wait);
        };
        return debounced;
    }

    executeDebounced<T extends (...args: any[]) => void>(func: T, ...args: Parameters<T>): void {
        if (this.timeout !== null) {
            clearTimeout(this.timeout);
        }
        this.timeout = setTimeout(() => {
            this.timeout = null;
            func(...args);
        }, this.wait);
    }

    cancel(): void {
        if (this.timeout !== null) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
    }

    setWait(wait: number): void {
        this.wait = wait;
    }
}
