import { HttpClient } from './HttpClient';
import { SessionManager } from './SessionManager';

export const httpClient = new HttpClient();
export const sessionManager = new SessionManager(httpClient);
