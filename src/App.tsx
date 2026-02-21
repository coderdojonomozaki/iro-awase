/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, RefreshCw, Check, AlertCircle, Trophy, Sparkles, Play } from 'lucide-react';
import confetti from 'canvas-confetti';
import { GoogleGenAI } from "@google/genai";
import { getRandomColor, calculateColorDistance, hexToRgb, rgbToHex, RGB } from './utils/colorUtils';

// --- Types ---
type GameState = 'START' | 'PLAYING' | 'RESULT' | 'LOADING' | 'RANKING';

interface ColorTarget {
  name: string;
  hex: string;
}

interface RankingEntry {
  id: number;
  username: string;
  score: number;
  color_name: string;
  created_at: string;
}

// --- Components ---

export default function App() {
  const [gameState, setGameState] = useState<GameState>('START');
  const [targetColor, setTargetColor] = useState<ColorTarget | null>(null);
  const [capturedColor, setCapturedColor] = useState<RGB | null>(null);
  const [score, setScore] = useState<number>(0);
  const [commentary, setCommentary] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState<string>("");
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [filterColor, setFilterColor] = useState<string>("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
      setError(null);
    } catch (err) {
      console.error("Camera error:", err);
      setError("カメラの起動に失敗しました。設定を確認してください。");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const startGame = () => {
    setTargetColor(getRandomColor());
    setGameState('PLAYING');
    startCamera();
  };

  const fetchTopRankings = async () => {
    try {
      const res = await fetch('/api/rankings');
      const data = await res.json();
      setRankings(data);
    } catch (err) {
      console.error("Failed to fetch top rankings:", err);
    }
  };

  useEffect(() => {
    if (gameState === 'START') {
      fetchTopRankings();
    }
  }, [gameState]);

  const captureColor = () => {
    if (!videoRef.current || !canvasRef.current || !targetColor) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) return;

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Sample the center pixel (or a small area around it)
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const sampleSize = 10;
    const imageData = ctx.getImageData(
      centerX - sampleSize / 2,
      centerY - sampleSize / 2,
      sampleSize,
      sampleSize
    );

    let r = 0, g = 0, b = 0;
    for (let i = 0; i < imageData.data.length; i += 4) {
      r += imageData.data[i];
      g += imageData.data[i + 1];
      b += imageData.data[i + 2];
    }
    const count = imageData.data.length / 4;
    const avgColor: RGB = {
      r: Math.round(r / count),
      g: Math.round(g / count),
      b: Math.round(b / count),
    };

    const targetRgb = hexToRgb(targetColor.hex);
    const calculatedScore = calculateColorDistance(avgColor, targetRgb);

    setCapturedColor(avgColor);
    setScore(calculatedScore);
    setGameState('LOADING');
    stopCamera();
    generateCommentary(targetColor.name, targetColor.hex, avgColor, calculatedScore);
  };

  const generateCommentary = async (targetName: string, targetHex: string, captured: RGB, score: number) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("API Key is missing");
      }
      const ai = new GoogleGenAI({ apiKey });
      const capturedHex = rgbToHex(captured);
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `
          あなたは「いろあわせ！カラーハンター」というゲームの審判です。
          小学生が遊んでいます。
          お題の色: ${targetName}
          撮影された色: ${capturedHex}
          マッチ度: ${score}%

          この結果に対して、短く、とても優しくて楽しい日本語のコメントを1つ生成してください。
          漢字は少なめにして、ひらがなを多めに使ってください。
          80点以上なら「すごい！天才！」と褒めちぎり、50点以下でも「おしい！次はもっと似てる色を探そう！」と励ましてください。
          絵文字をたくさん使ってください。
        `,
      });
      setCommentary(response.text || "いい色だね！✨");
      setGameState('RESULT');
      if (score >= 80) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
    } catch (err) {
      console.error("Gemini error:", err);
      setCommentary("素晴らしい色覚の持ち主ですね！");
      setGameState('RESULT');
    }
  };

  const resetGame = () => {
    setGameState('START');
    setTargetColor(null);
    setCapturedColor(null);
    setScore(0);
    setCommentary("");
    setError(null);
    setUsername("");
  };

  const fetchRankings = async (color?: string) => {
    try {
      const url = color ? `/api/rankings?color_name=${encodeURIComponent(color)}` : '/api/rankings';
      const res = await fetch(url);
      const data = await res.json();
      setRankings(data);
      setFilterColor(color || "");
      setGameState('RANKING');
    } catch (err) {
      console.error("Failed to fetch rankings:", err);
    }
  };

  const saveScore = async () => {
    if (!username.trim() || !targetColor) return;
    setIsSaving(true);
    try {
      await fetch('/api/rankings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          score,
          color_name: targetColor.name
        }),
      });
      await fetchRankings();
    } catch (err) {
      console.error("Failed to save score:", err);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  return (
    <div className="min-h-screen bg-[#FFFBEB] text-[#141414] font-sans selection:bg-[#FFD700] selection:text-black">
      {/* Header */}
      <header className="border-b-4 border-[#141414] p-6 flex justify-between items-center bg-[#FFD700]">
        <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
          <Sparkles className="fill-white" />
          いろあわせ！<span className="text-sm opacity-70">カラーハンター</span>
        </h1>
        {gameState !== 'START' && (
          <div className="flex gap-2">
            <button 
              onClick={() => fetchRankings()}
              className="bg-white border-2 border-[#141414] px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
            >
              <Trophy className="w-3 h-3 text-yellow-500" /> ランキング
            </button>
            <button 
              onClick={resetGame}
              className="bg-white border-2 border-[#141414] px-3 py-1 rounded-full text-xs font-bold shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
            >
              やめる
            </button>
          </div>
        )}
      </header>

      <main className="max-w-xl mx-auto p-6">
        <AnimatePresence mode="wait">
          {/* START SCREEN */}
          {gameState === 'START' && (
            <motion.div
              key="start"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.2 }}
              className="space-y-12 py-12 text-center"
            >
              <div className="relative inline-block">
                <div className="w-48 h-48 rounded-full border-4 border-[#141414] border-dashed animate-spin-slow absolute -inset-4" />
                <div className="w-48 h-48 rounded-full bg-gradient-to-tr from-[#FF6321] via-[#00FF00] to-[#2A5CAA] flex items-center justify-center shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] border-4 border-[#141414]">
                  <Camera className="w-24 h-24 text-white drop-shadow-lg" />
                </div>
              </div>
              
              <div className="space-y-4">
                <h2 className="text-4xl font-black">おなじ色をさがそう！</h2>
                <p className="text-lg font-bold opacity-80">
                  カメラでお題（おだい）の色を<br/>パシャッとさつえいしてね！📸
                </p>
              </div>

              <button
                onClick={startGame}
                className="group relative inline-flex items-center gap-3 bg-[#FF6321] text-white px-12 py-6 rounded-3xl text-2xl font-black transition-transform hover:scale-110 active:scale-95 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] border-4 border-[#141414]"
              >
                <Play className="fill-current w-8 h-8" />
                あそぶ！
              </button>

              {/* Top Rankings Preview */}
              {rankings.length > 0 && (
                <div className="bg-white border-4 border-[#141414] p-6 rounded-[32px] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] space-y-4">
                  <h3 className="text-xl font-black flex items-center justify-center gap-2">
                    <Trophy className="w-5 h-5 text-yellow-500" />
                    トップハンター
                  </h3>
                  <div className="space-y-2">
                    {rankings.slice(0, 3).map((entry, i) => (
                      <div key={entry.id} className="flex items-center justify-between p-2 border-b-2 border-[#141414]/10 last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="font-black text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                          <span className="font-bold">{entry.username}</span>
                        </div>
                        <span className="font-black text-[#FF6321]">{entry.score}%</span>
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={() => fetchRankings()}
                    className="w-full text-xs font-black uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity"
                  >
                    ランキングをもっとみる
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* PLAYING SCREEN */}
          {gameState === 'PLAYING' && targetColor && (
            <motion.div
              key="playing"
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              className="space-y-6"
            >
              {/* Target Color Card */}
              <div className="bg-white border-4 border-[#141414] p-6 rounded-[40px] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-black uppercase tracking-widest text-[#FF6321]">この色をさがして！</span>
                  <div className="flex items-center gap-2 bg-red-100 px-3 py-1 rounded-full border-2 border-red-500">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[10px] font-black text-red-500">カメラ中</span>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div 
                    className="w-28 h-28 rounded-3xl border-4 border-[#141414] shadow-inner"
                    style={{ backgroundColor: targetColor.hex }}
                  />
                  <div>
                    <h3 className="text-4xl font-black">{targetColor.name}</h3>
                    <p className="font-bold text-sm opacity-50">どんなところにあるかな？</p>
                  </div>
                </div>
              </div>

              {/* Camera View */}
              <div className="relative aspect-square bg-black rounded-[40px] overflow-hidden border-4 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)]">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                
                {/* Target Reticle */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-32 h-32 border-4 border-white rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full" />
                  </div>
                </div>

                {/* Capture Button Overlay */}
                <div className="absolute bottom-8 left-0 w-full flex justify-center">
                  <button
                    onClick={captureColor}
                    className="w-24 h-24 bg-white rounded-full border-4 border-[#141414] flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-transform"
                  >
                    <div className="w-16 h-16 bg-red-500 rounded-full border-4 border-[#141414]" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* LOADING SCREEN */}
          {gameState === 'LOADING' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-24 space-y-6"
            >
              <div className="w-20 h-20 border-8 border-[#FFD700] border-t-[#FF6321] rounded-full animate-spin" />
              <p className="text-2xl font-black animate-bounce">しらべてるよ...✨</p>
            </motion.div>
          )}

          {/* RESULT SCREEN */}
          {gameState === 'RESULT' && targetColor && capturedColor && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8"
            >
              <div className="text-center space-y-2">
                <div className="inline-flex items-center gap-2 px-6 py-2 bg-[#FFD700] border-4 border-[#141414] rounded-full text-lg font-black shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                  <Trophy className="w-6 h-6 text-yellow-600" />
                  マッチど！
                </div>
                <h2 className="text-9xl font-black tracking-tighter text-[#FF6321] drop-shadow-[4px_4px_0px_#141414]">
                  {score}<span className="text-4xl">てん</span>
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="bg-white border-4 border-[#141414] p-4 rounded-[32px] shadow-[6px_6px_0px_0px_rgba(20,20,20,1)]">
                  <p className="text-xs font-black uppercase opacity-50 mb-2">おだい</p>
                  <div 
                    className="aspect-square rounded-2xl border-4 border-[#141414] mb-2"
                    style={{ backgroundColor: targetColor.hex }}
                  />
                  <p className="font-black text-center">{targetColor.name}</p>
                </div>
                <div className="bg-white border-4 border-[#141414] p-4 rounded-[32px] shadow-[6px_6px_0px_0px_rgba(20,20,20,1)]">
                  <p className="text-xs font-black uppercase opacity-50 mb-2">とった色</p>
                  <div 
                    className="aspect-square rounded-2xl border-4 border-[#141414] mb-2"
                    style={{ backgroundColor: rgbToHex(capturedColor) }}
                  />
                  <p className="font-black text-center">キミの色！</p>
                </div>
              </div>

              {/* Commentary Card */}
              <div className="bg-[#00FF00] border-4 border-[#141414] p-8 rounded-[40px] shadow-[10px_10px_0px_0px_rgba(20,20,20,1)] relative overflow-hidden">
                <div className="relative z-10">
                  <p className="text-2xl font-black leading-tight">
                    {commentary}
                  </p>
                </div>
                <div className="absolute -right-4 -bottom-4 opacity-20">
                  <Sparkles className="w-32 h-32" />
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <button
                  onClick={startGame}
                  className="bg-[#FF6321] text-white py-6 rounded-3xl font-black text-2xl hover:scale-105 active:scale-95 transition-transform flex items-center justify-center gap-3 border-4 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]"
                >
                  <RefreshCw className="w-8 h-8" />
                  もういっかい！
                </button>
                
                {/* Save Score Section */}
                <div className="bg-white border-4 border-[#141414] p-6 rounded-[32px] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] space-y-4">
                  <p className="text-sm font-black text-center">ランキングにのせる？</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="なまえをいれてね"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      maxLength={10}
                      className="flex-1 border-4 border-[#141414] px-4 py-3 rounded-2xl font-black outline-none focus:bg-[#00FF00]/10 text-lg"
                    />
                    <button
                      onClick={saveScore}
                      disabled={!username.trim() || isSaving}
                      className="bg-[#141414] text-white px-8 py-3 rounded-2xl font-black disabled:opacity-30 transition-opacity text-lg"
                    >
                      {isSaving ? '...' : 'OK!'}
                    </button>
                  </div>
                </div>

                <button
                  onClick={resetGame}
                  className="py-4 border-4 border-[#141414] rounded-2xl font-black hover:bg-white transition-colors"
                >
                  さいしょにもどる
                </button>
              </div>
            </motion.div>
          )}

          {/* RANKING SCREEN */}
          {gameState === 'RANKING' && (
            <motion.div
              key="ranking"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="text-center space-y-2">
                <Trophy className="w-16 h-16 mx-auto text-[#FFC800] drop-shadow-[4px_4px_0px_#141414]" />
                <h2 className="text-4xl font-black italic">ランキング</h2>
              </div>

              {/* Color Filter Tabs */}
              <div className="flex overflow-x-auto pb-2 gap-2 no-scrollbar">
                <button
                  onClick={() => fetchRankings()}
                  className={`shrink-0 px-4 py-2 rounded-full border-2 border-[#141414] font-black text-xs transition-colors shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] ${!filterColor ? 'bg-[#FFD700]' : 'bg-white'}`}
                >
                  すべて
                </button>
                {["さくら色", "そらいろ", "わかくさいろ", "ひまわりいろ", "あかいろ", "きんいろ"].map(c => (
                  <button
                    key={c}
                    onClick={() => fetchRankings(c)}
                    className={`shrink-0 px-4 py-2 rounded-full border-2 border-[#141414] font-black text-xs transition-colors shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] ${filterColor === c ? 'bg-[#FFD700]' : 'bg-white'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <div className="bg-white border-4 border-[#141414] rounded-[40px] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b-4 border-[#141414] bg-[#FFD700]">
                      <th className="p-4 text-sm font-black uppercase">順位</th>
                      <th className="p-4 text-sm font-black uppercase">なまえ</th>
                      <th className="p-4 text-sm font-black uppercase">色</th>
                      <th className="p-4 text-sm font-black uppercase text-right">スコア</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankings.map((entry, index) => (
                      <tr key={entry.id} className="border-b-2 border-[#141414]/10 hover:bg-[#00FF00]/10 transition-colors">
                        <td className="p-4 font-black text-xl">
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`}
                        </td>
                        <td className="p-4 font-black text-lg">{entry.username}</td>
                        <td className="p-4 text-sm font-bold opacity-70">{entry.color_name}</td>
                        <td className="p-4 text-right font-black text-2xl text-[#FF6321]">{entry.score}%</td>
                      </tr>
                    ))}
                    {rankings.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-12 text-center font-black opacity-50">まだだれもいないよ！</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <button
                onClick={resetGame}
                className="w-full bg-[#141414] text-white py-6 rounded-3xl font-black text-2xl hover:scale-105 active:scale-95 transition-transform border-4 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]"
              >
                もどる
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="text-center py-8 opacity-50 text-xs font-bold">
        &copy; 2026 野母崎総合文化部
      </footer>

      {/* Hidden Canvas for processing */}
      <canvas ref={canvasRef} className="hidden" />

      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 12s linear infinite;
        }
      `}</style>
    </div>
  );
}
