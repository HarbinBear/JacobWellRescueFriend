import { CONFIG } from '../core/config';

// Create canvas
export const canvas = wx.createCanvas();
export const ctx = canvas.getContext('2d');

// Set canvas size
canvas.width = CONFIG.screenWidth;
canvas.height = CONFIG.screenHeight;
