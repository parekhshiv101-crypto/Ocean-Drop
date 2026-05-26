import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Pause, Play, Settings, Volume2, Music, X, Home } from "lucide-react";
import { useGameLoop, HatType, sounds } from "./components/GameCanvas";
import { useLeaderboard } from "./lib/useLeaderboard";
import { auth, signIn } from "./lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";

export default function App() {
  const [currentScore, setCurrentScore] = useState(0);
  const [maxHeight, setMaxHeight] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('playerName') || 'Doodler');
  const [hatType, setHatType] = useState<HatType>(() => (localStorage.getItem('hatType') as HatType) || 'none');
  const [user, setUser] = useState<User | null>(null);
  
  const [localHighScore, setLocalHighScore] = useState(() => parseInt(localStorage.getItem('localHighScore') || '0', 10));
  const [totalEnemiesDefeated, setTotalEnemiesDefeated] = useState(() => parseInt(localStorage.getItem('totalEnemiesDefeated') || '0', 10));
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [sfxVolume, setSfxVolume] = useState(() => sounds.sfxVolume);
  const [musicVolume, setMusicVolume] = useState(() => sounds.musicVolume);
  
  const handleSfxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setSfxVolume(val);
    sounds.sfxVolume = val;
  };

  const handleMusicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setMusicVolume(val);
    sounds.musicVolume = val;
  };
  
  const { scores, submitScore } = useLeaderboard();

  // Listen to auth state
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser && currentUser.displayName && localStorage.getItem('playerName') === null) {
         setPlayerName(currentUser.displayName.substring(0, 15));
      }
    });
    return () => unsubscribe();
  }, []);

  const handleGameOver = (finalScore: number, finalHeight: number, enemiesDefeated: number) => {
    setGameOver(true);
    setIsPlaying(false);
    
    if (finalScore > localHighScore) {
      setLocalHighScore(finalScore);
      localStorage.setItem('localHighScore', finalScore.toString());
    }
    
    const newEnemiesTotal = totalEnemiesDefeated + enemiesDefeated;
    setTotalEnemiesDefeated(newEnemiesTotal);
    localStorage.setItem('totalEnemiesDefeated', newEnemiesTotal.toString());

    if (finalScore > 0 && user?.emailVerified) {
      submitScore(playerName, finalScore, finalHeight);
    }
  };

  const handleScoreUpdate = (score: number, height: number) => {
    setCurrentScore(score);
    setMaxHeight(height);
  };

  const { canvasRef, startGame, isPaused, togglePause, quitGame } = useGameLoop(handleGameOver, handleScoreUpdate, hatType);

  const handleStart = () => {
    localStorage.setItem('playerName', playerName);
    localStorage.setItem('hatType', hatType);
    setGameOver(false);
    setIsPlaying(true);
    setCurrentScore(0);
    setMaxHeight(0);
    startGame();
  };

  const handleQuitMenu = () => {
    quitGame();
    setIsPlaying(false);
    setGameOver(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyP') {
        togglePause();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePause]);

  const handleSignIn = async () => {
    await signIn();
  };

  return (
    <div 
      className="min-h-screen bg-[#E8E8E1] flex items-center justify-center font-sans text-slate-800 select-none overflow-auto py-8 sm:py-12" 
      style={{
        backgroundColor: '#E8E8E1', 
        backgroundImage: 'radial-gradient(#d1d1c4 1px, transparent 1px)', 
        backgroundSize: '20px 20px'
      }}
    >
      <div className="flex flex-col lg:flex-row gap-8 items-center lg:items-start scale-90 sm:scale-100 origin-top">
        {/* Left Panel */}
        <div className="w-64 flex flex-col gap-6">
          <div className="bg-white p-6 border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-sm">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Player Stats</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <span className="text-sm font-medium">Score</span>
                <span className="text-2xl font-black">{currentScore.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-sm font-medium">Max Height</span>
                <span className="text-lg font-bold text-blue-600">{maxHeight.toLocaleString()}m</span>
              </div>
            </div>
            {isPlaying && (
              <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col gap-2">
                <button 
                  onClick={togglePause}
                  className="w-full bg-slate-100 hover:bg-slate-200 border-2 border-slate-900 p-2 font-black uppercase text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all flex items-center justify-center gap-2"
                >
                  {isPaused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}
                  {isPaused ? "Resume" : "Pause"}
                </button>
                <button 
                  onClick={handleQuitMenu}
                  className="w-full bg-red-400 hover:bg-red-500 text-white border-2 border-slate-900 p-2 font-black uppercase text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all flex items-center justify-center gap-2"
                >
                  <Home size={14} fill="currentColor" />
                  Menu
                </button>
              </div>
            )}
            {!isPlaying && (
              <div className="mt-6 pt-4 border-t border-slate-100 space-y-3">
                {!user && (
                   <button 
                    onClick={handleSignIn}
                    className="w-full bg-blue-400 hover:bg-blue-500 text-white border-2 border-slate-900 p-2 font-black uppercase text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all"
                  >
                    Sign In with Google
                  </button>
                )}
                
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value.substring(0, 15))}
                  disabled={isPlaying}
                  placeholder="Enter Name"
                  className="w-full text-center border-2 border-slate-900 bg-slate-50 p-2 font-bold uppercase text-sm"
                  maxLength={15}
                />
                
                <button 
                  onClick={handleStart}
                  className="w-full bg-lime-400 hover:bg-lime-500 border-2 border-slate-900 p-2 font-black uppercase text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all"
                >
                  {gameOver ? "Play Again" : "Start Game"}
                </button>

                {!user && (
                  <p className="text-[10px] text-slate-500 font-bold uppercase text-center mt-1">
                    Playing as guest (no leaderboard)
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="bg-white p-6 border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-sm">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 flex justify-between">
              <span>Outfits</span>
              <span className="text-slate-300" title="Defeated Enemies">{totalEnemiesDefeated} 💀</span>
            </h3>
            <div className="grid grid-cols-2 gap-2 h-48 overflow-y-auto pr-1">
              {[
                { id: 'none', label: 'None' },
                { id: 'tophat', label: 'Tophat' },
                { id: 'cap', label: 'Cap' },
                { id: 'crown', label: 'Crown' },
                { id: 'astronaut', label: 'Astro', unlockScore: 10000 },
                { id: 'ninja', label: 'Ninja', unlockScore: 20000 },
                { id: 'pirate', label: 'Pirate', unlockEnemies: 10 },
                { id: 'alien', label: 'Alien', unlockEnemies: 50 },
              ].map((hat) => {
                const isUnlocked = 
                  (!hat.unlockScore || localHighScore >= hat.unlockScore) && 
                  (!hat.unlockEnemies || totalEnemiesDefeated >= hat.unlockEnemies);
                
                return (
                  <button
                    key={hat.id}
                    onClick={() => {
                        if (isUnlocked) setHatType(hat.id as HatType);
                    }}
                    disabled={isPlaying || !isUnlocked}
                    className={`border-2 border-slate-900 p-2 text-[10px] font-black uppercase transition-all relative overflow-hidden group
                      ${hatType === hat.id ? 'bg-slate-900 text-white shadow-none' : 
                        isUnlocked ? 'bg-slate-50 hover:bg-slate-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]' 
                        : 'bg-slate-200 text-slate-400 opacity-60 cursor-not-allowed'}
                    `}
                  >
                    {hat.label}
                    {!isUnlocked && (
                       <div className="absolute inset-0 bg-slate-900/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[1px]">
                         <span className="text-[8px] bg-white text-slate-900 px-1 border border-slate-900 leading-none py-0.5">
                           {hat.unlockScore ? `${hat.unlockScore} pts` : `${hat.unlockEnemies} kills`}
                         </span>
                       </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white p-6 border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-sm">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Legend</h3>
            <div className="space-y-2 text-xs font-bold">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-lime-400 border border-slate-900 relative">
                  <div className="absolute -bottom-1 left-[3px] w-[2px] h-[4px] bg-slate-900"></div>
                  <div className="absolute -bottom-1 right-[3px] w-[2px] h-[4px] bg-slate-900"></div>
                </div> Player
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-sm bg-green-500 border border-slate-900"></div> Platform
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-sm bg-blue-400 border border-slate-900 shadow-[0_2px_4px_rgba(96,165,250,0.4)]"></div> Moving
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-sm bg-yellow-300 border border-slate-900 flex justify-center items-center">
                  <div className="w-[1px] h-full bg-slate-900 rotate-45"></div>
                </div> Breaking
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-red-500 border border-slate-900 flex items-center justify-center">
                  <div className="w-1.5 h-[1px] bg-white"></div>
                </div> Enemy
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-sm bg-slate-100 border border-slate-900 flex flex-col justify-between py-[2px] px-[1px]">
                  <div className="h-[1px] bg-slate-400 w-full"></div>
                  <div className="h-[1px] bg-slate-400 w-full"></div>
                  <div className="h-[1px] bg-slate-400 w-full"></div>
                  <div className="h-[1px] bg-slate-400 w-full"></div>
                </div> Spring
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 flex gap-[1px]">
                  <div className="flex-1 rounded-[1px] bg-orange-500 border border-slate-900"></div>
                  <div className="flex-1 rounded-[1px] bg-orange-500 border border-slate-900"></div>
                </div> Jetpack
              </div>
            </div>
          </div>
        </div>

        {/* Center Canvas container */}
        <div 
          className="relative w-[420px] h-[680px] bg-white border-[6px] border-slate-900 shadow-[12px_12px_0px_0px_rgba(0,0,0,0.1)] overflow-hidden" 
          style={{
            backgroundImage: 'linear-gradient(#e5e5e5 1px, transparent 1px), linear-gradient(90deg, #e5e5e5 1px, transparent 1px)', 
            backgroundSize: '30px 30px'
          }}
        >
          {isPlaying && (
            <div className="absolute top-8 left-0 right-0 text-center z-20 pointer-events-none">
              <div className="inline-block bg-slate-900 text-white px-4 py-1 font-mono text-xl tracking-tighter">
                {String(currentScore).padStart(8, '0')}
              </div>
            </div>
          )}
          
          <AnimatePresence>
            {!isPlaying && !gameOver && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-start justify-start pt-20 pl-8 z-30 pointer-events-none"
              >
                  <motion.div 
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="bg-white/90 backdrop-blur-sm p-5 border-4 border-slate-900 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center flex flex-col items-center w-[240px] pointer-events-auto"
                  >
                    <h1 className="text-4xl font-black uppercase tracking-tighter text-lime-400 drop-shadow-[2px_2px_0px_#0f172a] mb-1">Ocean<br/>Drop</h1>
                    <p className="text-[10px] font-bold text-slate-500 mb-5 uppercase tracking-widest leading-tight">A Doodler<br/>Adventure</p>
                    
                    <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleStart}
                      className="w-full mb-3 bg-lime-400 hover:bg-lime-500 border-2 border-slate-900 px-4 py-3 font-black uppercase text-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all flex justify-center items-center gap-2"
                    >
                      <Play size={20} fill="currentColor" />
                      Play Now
                    </motion.button>
                    
                    <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setIsSettingsOpen(true)}
                      className="w-full bg-slate-100 hover:bg-slate-200 border-2 border-slate-900 px-4 py-3 font-black uppercase text-base shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all flex justify-center items-center gap-2"
                    >
                      <Settings size={18} fill="currentColor" />
                      Settings
                    </motion.button>
                  </motion.div>
              </motion.div>
            )}

            {isSettingsOpen && !isPlaying && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-50"
              >
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-white p-8 border-4 border-slate-900 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-[320px]"
                  >
                    <div className="flex justify-between items-center mb-6 border-b-2 border-slate-200 pb-4">
                      <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Settings</h2>
                      <button onClick={() => setIsSettingsOpen(false)} className="hover:text-red-500 transition-colors">
                        <X size={24} />
                      </button>
                    </div>

                    <div className="space-y-6">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Volume2 size={18} className="text-slate-500" />
                          <label className="text-sm font-bold uppercase tracking-widest text-slate-700">SFX Volume</label>
                        </div>
                        <div className="flex items-center gap-4">
                          <input 
                            type="range" min="0" max="1" step="0.05" 
                            value={sfxVolume} onChange={handleSfxChange}
                            className="w-full accent-slate-900"
                          />
                          <span className="text-xs font-bold w-8 text-right">{Math.round(sfxVolume * 100)}%</span>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Music size={18} className="text-slate-500" />
                          <label className="text-sm font-bold uppercase tracking-widest text-slate-700">Music & Ambient</label>
                        </div>
                        <div className="flex items-center gap-4">
                          <input 
                            type="range" min="0" max="1" step="0.05" 
                            value={musicVolume} onChange={handleMusicChange}
                            className="w-full accent-slate-900"
                          />
                          <span className="text-xs font-bold w-8 text-right">{Math.round(musicVolume * 100)}%</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
              </motion.div>
            )}

            {gameOver && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px] flex flex-col items-center justify-center z-30"
              >
                 <motion.div 
                  initial={{ scale: 0.5, rotate: -10, opacity: 0 }}
                  animate={{ 
                    scale: 1, 
                    rotate: -2, 
                    opacity: 1,
                    x: [0, -2, 2, -2, 2, 0] // Subtle shake on entry
                  }}
                  transition={{ 
                    type: "spring", 
                    damping: 12, 
                    stiffness: 200,
                    x: { duration: 0.4, delay: 0.2 } 
                  }}
                  className="bg-white p-8 border-4 border-slate-900 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center"
                 >
                    <motion.h2 
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      className="text-4xl font-black uppercase text-red-500 mb-2 drop-shadow-[2px_2px_0px_#0f172a]"
                    >
                      Game Over
                    </motion.h2>
                    <motion.p 
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="font-bold text-lg mb-6"
                    >
                      Score: {currentScore.toLocaleString()}
                    </motion.p>
                    <motion.div
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      className="flex flex-col gap-3 w-full"
                    >
                      <motion.button 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleStart}
                        className="w-full bg-lime-400 hover:bg-lime-500 border-2 border-slate-900 px-6 py-3 font-black uppercase text-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all flex items-center justify-center"
                      >
                        Play Again
                      </motion.button>
                      <motion.button 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleQuitMenu}
                        className="w-full bg-red-400 hover:bg-red-500 text-white border-2 border-slate-900 px-6 py-3 font-black uppercase text-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all flex items-center justify-center gap-2"
                      >
                        <Home size={20} fill="currentColor" />
                        Menu
                      </motion.button>
                    </motion.div>
                 </motion.div>
              </motion.div>
            )}

            {isPaused && !gameOver && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-[4px] flex flex-col items-center justify-center z-30"
              >
                 <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-white p-10 border-4 border-slate-900 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center flex flex-col items-center"
                 >
                    <Pause size={48} className="text-blue-500 mb-4 fill-current" />
                    <h2 className="text-4xl font-black uppercase text-slate-900 mb-6 tracking-tighter">
                      Paused
                    </h2>
                    <div className="flex flex-col gap-3 w-full">
                      <motion.button 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={togglePause}
                        className="w-full bg-lime-400 hover:bg-lime-500 border-2 border-slate-900 px-8 py-4 font-black uppercase text-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all flex items-center justify-center gap-3"
                      >
                        <Play size={24} fill="currentColor" />
                        Resume
                      </motion.button>
                      <motion.button 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleQuitMenu}
                        className="w-full bg-red-400 hover:bg-red-500 text-white border-2 border-slate-900 px-8 py-4 font-black uppercase text-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all flex items-center justify-center gap-3"
                      >
                        <Home size={24} fill="currentColor" />
                        Menu
                      </motion.button>
                    </div>
                 </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
          
          <canvas 
            ref={canvasRef} 
            width={420} 
            height={680} 
            className="block"
          />
          
          <div className="absolute top-0 w-full h-full pointer-events-none border-[20px] border-white opacity-20 z-40"></div>
        </div>

        {/* Right Panel */}
        <div className="w-64 flex flex-col gap-6">
          <div className="bg-white border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-sm overflow-hidden flex-1 h-[400px]">
            <div className="bg-slate-900 text-white p-3 text-xs font-bold uppercase tracking-widest text-center sticky top-0">
              Leaderboard
            </div>
            <div className="p-4 space-y-3 h-full overflow-y-auto pb-12">
              {scores.map((s, index) => (
                <div key={`${s.id || s.userId}-${index}`} className={`flex items-center justify-between group ${index > 2 ? 'opacity-80' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-5 h-5 flex items-center justify-center border border-slate-900 text-[10px] font-black
                      ${index === 0 ? 'bg-yellow-400' : index === 1 ? 'bg-slate-200' : index === 2 ? 'bg-orange-200' : 'bg-transparent text-slate-500 border-slate-400'}
                    `}>
                      {index + 1}
                    </span>
                    <span className="text-sm font-bold truncate w-24" title={s.displayName}>{s.displayName}</span>
                  </div>
                  <span className="text-xs font-mono font-medium">{s.score.toLocaleString()}</span>
                </div>
              ))}
              {scores.length === 0 && (
                <div className="text-center text-xs font-medium text-slate-400 mt-10">No scores yet!</div>
              )}
            </div>
          </div>

          <div className="bg-white p-4 border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-sm text-center">
            <p className="text-[11px] font-black uppercase text-slate-400 mb-3 tracking-widest border-b-2 border-slate-100 pb-1">Controls</p>
            
            <div className="flex flex-col gap-4">
               {/* Mobile Controls */}
               <div className="bg-slate-50 p-2 border-2 border-slate-200 rounded-sm">
                  <p className="text-[10px] font-black uppercase text-slate-800 mb-2 flex items-center justify-center gap-1">
                    <span className="text-sm">📱</span> Mobile
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-[9px] font-bold text-slate-600 uppercase">
                      <span>Move</span>
                      <span className="bg-white border-2 border-slate-300 px-2 py-0.5 rounded shadow-[1px_1px_0px_0px_rgba(203,213,225,1)] text-[8px]">Tilt Device</span>
                    </div>
                    <div className="flex justify-between items-center text-[9px] font-bold text-slate-600 uppercase">
                      <span>Dive ⚡</span>
                      <span className="bg-white border-2 border-slate-300 px-2 py-0.5 rounded shadow-[1px_1px_0px_0px_rgba(203,213,225,1)] text-[8px] text-blue-600">Tap Screen</span>
                    </div>
                  </div>
               </div>
               
               {/* Desktop Controls */}
               <div className="bg-slate-50 p-2 border-2 border-slate-200 rounded-sm">
                  <p className="text-[10px] font-black uppercase text-slate-800 mb-2 flex items-center justify-center gap-1">
                    <span className="text-sm">💻</span> Desktop
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-[9px] font-bold text-slate-600 uppercase">
                      <span>Move</span>
                      <div className="flex gap-1 text-[8px]">
                        <span className="bg-white border-2 border-slate-300 px-2 py-0.5 rounded shadow-[1px_1px_0px_0px_rgba(203,213,225,1)]">A / D</span>
                        <span className="bg-white border-2 border-slate-300 px-2 py-0.5 rounded shadow-[1px_1px_0px_0px_rgba(203,213,225,1)]">◀ ▶</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-[9px] font-bold text-slate-600 uppercase">
                      <span>Dive ⚡</span>
                      <div className="flex gap-1 text-[8px]">
                        <span className="bg-white border-2 border-slate-300 px-2 py-0.5 rounded shadow-[1px_1px_0px_0px_rgba(203,213,225,1)] text-blue-600">Space</span>
                        <span className="bg-white border-2 border-slate-300 px-2 py-0.5 rounded shadow-[1px_1px_0px_0px_rgba(203,213,225,1)] text-blue-600">▼</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-[9px] font-bold text-slate-600 uppercase mt-1 border-t border-slate-200 pt-1.5">
                      <span>Pause</span>
                      <span className="bg-white border-2 border-slate-300 px-2 py-0.5 rounded shadow-[1px_1px_0px_0px_rgba(203,213,225,1)] text-[8px]">P</span>
                    </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
