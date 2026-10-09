import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
