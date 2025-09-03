import React, { useState, useEffect, useCallback } from 'react';
import { Calculator, Download, Settings, AlertTriangle, Beaker, Droplets, Wind, Activity } from 'lucide-react';
import { CardEnhanced, CardHeader, CardTitle, CardContent } from './components/ui/card-enhanced';
import { ButtonEnhanced } from './components/ui/button-enhanced';
import { InputEnhanced } from './components/ui/input-enhanced';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import './index.css';

// Animated Number Component with proper typing
const AnimatedNumber: React.FC<{
  value: number;
  decimals?: number;
  suffix?: string;
}> = ({ value, decimals = 2, suffix = "" }) => {
  const spring = useSpring(value, { stiffness: 100, damping: 30 });
  const display = useTransform(spring, (current: number) => `${current.toFixed(decimals)}${suffix}`);
  
  return <motion.span>{display}</motion.span>;
};

// Animation variants
const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
  hover: { y: -2, transition: { duration: 0.2 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
};

const MFCCalculator: React.FC = () => {
  const [inputs, setInputs] = useState({
    totalFlow: 500,
    targetHumidity: 35,
    ch2oSourceConc: 5.35,
    concentrations: [50, 100, 200],
    useDesmosMath: true
  });

  const [timings, setTimings] = useState({
    baselineDuration: 30,
    exposureDuration: 30,
    stabilizationTime: 5
  });

  const [calibration] = useState({
    humiditySlope: 6.0785,
    humidityIntercept: -32.458,
    humidityOffset: 0,
    humidityScaleFactor: 1,
    ch2oCalibrationFactor: 1
  });

  const [results, setResults] = useState<{
    mfcA: number;
    mfcB: number;
    mfcC: Array<{
      concentration: number;
      flow: number;
      flow_standard?: number;
      flow_desmos?: number;
    }>;
    isValid: boolean;
    warnings: string[];
  }>({
    mfcA: 0,
    mfcB: 0,
    mfcC: [],
    isValid: true,
    warnings: []
  });

  const [csvData, setCsvData] = useState('');

  const calculateMFCValues = useCallback(() => {
    const warnings: string[] = [];

    // Validate inputs
    if (inputs.totalFlow <= 0 || inputs.targetHumidity < 0 || inputs.targetHumidity > 100) {
      setResults({
        mfcA: 0,
        mfcB: 0,
        mfcC: [],
        isValid: false,
        warnings: ['Invalid input parameters']
      });
      return;
    }

    // Calculate MFC B (humid air) using calibration
    let mfcB = calibration.humiditySlope * inputs.targetHumidity + calibration.humidityIntercept;
    if (mfcB < 0) mfcB = 0;

    // Calculate MFC C values for each concentration
    const mfcCValues = inputs.concentrations.map(conc => {
      // Standard calculation
      const flow_standard = (conc / 1000) * inputs.totalFlow / inputs.ch2oSourceConc;
      
      // Desmos calculation with calibration factor
      const flow_desmos = flow_standard * calibration.ch2oCalibrationFactor;
      
      return {
        concentration: conc,
        flow: inputs.useDesmosMath ? flow_desmos : flow_standard,
        flow_standard,
        flow_desmos
      };
    });

    // Calculate MFC A (dry air)
    const mfcA = inputs.totalFlow - mfcB;
    
    // Validation warnings
    if (inputs.targetHumidity > 80) warnings.push('Humidity >80% may cause condensation');
    if (inputs.targetHumidity < 10) warnings.push('Humidity <10% may be difficult to achieve');
    
    // Check if max MFC C flow exceeds MFC A capacity
    const maxMfcCFlow = Math.max(...mfcCValues.map(item => item.flow));
    if (maxMfcCFlow > mfcA) {
      warnings.push(`Max MFC C flow (${maxMfcCFlow.toFixed(2)} SLPM) exceeds MFC A capacity (${mfcA.toFixed(2)} SLPM)`);
    }

    console.log('Setting results:', { mfcA, mfcB, mfcCValues });
    setResults({
      mfcA,
      mfcB,
      mfcC: mfcCValues,
      isValid: true,
      warnings
    });
  }, [inputs, calibration]);

  useEffect(() => {
    calculateMFCValues();
  }, [calculateMFCValues]);

  useEffect(() => {
    calculateMFCValues();
  }, []);

  const generateCSV = useCallback(() => {
    if (!results.isValid) return '';
  
    const { baselineDuration, exposureDuration } = timings;
    const { mfcA, mfcB, mfcC } = results;
  
    let csvContent = '# Alicat SSCM MFC Configuration\n';
    csvContent += `# Target Humidity: ${inputs.targetHumidity}% RH\n`;
    csvContent += `# Total Flow: ${inputs.totalFlow} SLPM\n`;
    csvContent += `# CH2O Source Concentration: ${inputs.ch2oSourceConc} ppm\n`;
    csvContent += `# Generated: ${new Date().toISOString()}\n`;
    csvContent += '#\n';
    csvContent += '# Protocol: Baseline -> Concentration Steps -> Shutdown\n';
    csvContent += '# MFC A: Dry air, MFC B: Humid air, MFC C: CH2O source\n';
    csvContent += '#\n';
    csvContent += 'Time,MFC A,MFC B,MFC C\n';
  
    let currentTime = 0;
  
    // Initial air baseline
    csvContent += `${currentTime},${mfcA.toFixed(2)},${mfcB.toFixed(2)},0\n`;
    currentTime += baselineDuration * 60;
  
    // For each concentration step, alternate air -> concentration
    mfcC.forEach((concData) => {
      // Air baseline before this concentration
      csvContent += `${currentTime},${mfcA.toFixed(2)},${mfcB.toFixed(2)},0\n`;
  
      // MFC A reduces by the amount of MFC C flow to maintain total flow
      const adjustedMfcA = mfcA - concData.flow;
  
      // Concentration exposure
      csvContent += `${currentTime},${adjustedMfcA.toFixed(2)},${mfcB.toFixed(2)},${concData.flow.toFixed(9)}\n`;
      currentTime += exposureDuration * 60;
    });
  
    // Final air baseline
    csvContent += `${currentTime},${mfcA.toFixed(2)},${mfcB.toFixed(2)},0\n`;
  
    // System shutdown
    csvContent += `${currentTime},0,0,0\n`;
  
    return csvContent;
  }, [results, timings, inputs]);

  const getTotalTime = useCallback((): string => {
    const numConcentrations = inputs.concentrations.length;
    if (numConcentrations === 0) return "0";
    const totalMinutes = (numConcentrations * timings.baselineDuration) + (numConcentrations * timings.exposureDuration) + timings.exposureDuration;
    return (totalMinutes / 60).toFixed(1);
  }, [inputs.concentrations, timings]);

  const downloadCSV = useCallback(() => {
    const csvContent = generateCSV();
    setCsvData(csvContent);
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    a.href = url;
    a.download = `MFC_${inputs.targetHumidity}RH_${timestamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [generateCSV, inputs.targetHumidity]);

  return (
    <div className="min-h-screen bg-background">
      <motion.div 
        className="max-w-4xl mx-auto p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {/* Header */}
        <motion.div variants={cardVariants} whileHover="hover">
          <CardEnhanced variant="glass">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <motion.div 
                    className="p-3 apple-card border-border/30"
                    whileHover={{ scale: 1.05, rotate: 5 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <Calculator className="text-primary" size={28} />
                  </motion.div>
                  <div>
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <CardTitle className="text-xl sm:text-2xl font-light">MFC Calculator</CardTitle>
                      <p className="text-muted-foreground font-light text-sm sm:text-base">Professional Mass Flow Control System</p>
                    </motion.div>
                  </div>
                </div>
                <motion.div 
                  className="flex items-center gap-2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  <motion.div 
                    className="w-2 h-2 bg-success rounded-full"
                    animate={{ 
                      scale: [1, 1.2, 1],
                      opacity: [1, 0.7, 1]
                    }}
                    transition={{ 
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  />
                  <span className="text-sm font-medium text-success">System Ready</span>
                </motion.div>
              </div>
            
            <AnimatePresence>
              {results.warnings.length > 0 && (
                <motion.div 
                  className="space-y-2 mt-4"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {results.warnings.map((warning, idx) => (
                    <motion.div 
                      key={idx} 
                      className="flex items-center gap-3 p-3 bg-warning/5 border border-warning/20 rounded-xl"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                    >
                      <motion.div
                        animate={{ rotate: [0, -10, 10, 0] }}
                        transition={{ duration: 0.5, delay: idx * 0.1 + 0.2 }}
                      >
                        <AlertTriangle className="text-warning flex-shrink-0" size={16} />
                      </motion.div>
                      <span className="text-warning/90 text-sm font-medium">{warning}</span>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            </CardHeader>
          </CardEnhanced>
        </motion.div>

        {/* Parameters Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* System Parameters */}
          <motion.div variants={cardVariants} whileHover="hover">
            <CardEnhanced variant="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 sm:gap-3 text-base sm:text-lg font-light">
                <div className="p-2 apple-card border-border/30">
                  <Settings className="text-primary w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <span className="text-sm sm:text-base">System Parameters</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <InputEnhanced 
                  type="number" 
                  label="Total Flow (SLPM)" 
                  value={inputs.totalFlow}
                  onChange={(e) => setInputs({...inputs, totalFlow: parseFloat(e.target.value) || 500})}
                  variant="professional"
                />
                <InputEnhanced 
                  type="number" 
                  min="0" 
                  max="100" 
                  step="0.1"
                  label="Target Humidity (%)" 
                  value={inputs.targetHumidity}
                  onChange={(e) => setInputs({...inputs, targetHumidity: parseFloat(e.target.value) || 50})}
                  variant="professional"
                />
              </div>
              
              <InputEnhanced 
                type="number" 
                label="CH2O Source Concentration (ppm)" 
                value={inputs.ch2oSourceConc}
                onChange={(e) => setInputs({...inputs, ch2oSourceConc: parseFloat(e.target.value) || 2000})}
                variant="professional"
              />
              
              <InputEnhanced 
                type="text" 
                label="Concentration Steps (ppb)" 
                value={inputs.concentrations.join(', ')}
                onChange={(e) => {
                  const values = e.target.value.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
                  setInputs({...inputs, concentrations: values});
                }}
                placeholder="50, 100, 200"
                variant="professional"
              />

              {/* Calculation Method Toggle */}
              <div className="flex items-center justify-between p-3 apple-card border-border/30 rounded-xl">
                <div>
                  <h4 className="font-medium text-foreground">Use Desmos Math</h4>
                  <p className="text-sm text-muted-foreground">Enhanced calculation method</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inputs.useDesmosMath}
                    onChange={(e) => setInputs({...inputs, useDesmosMath: e.target.checked})}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/25 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
            </CardContent>
            </CardEnhanced>
          </motion.div>

          {/* Timing Configuration */}
          <motion.div variants={cardVariants} whileHover="hover">
            <CardEnhanced variant="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 sm:gap-3 text-base sm:text-lg font-light">
                <div className="p-2 apple-card border-border/30">
                  <Settings className="text-primary w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <span className="text-sm sm:text-base">Timing Configuration</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <InputEnhanced 
                  type="number" 
                  min="1"
                  label="Baseline (min)" 
                  value={timings.baselineDuration}
                  onChange={(e) => setTimings({...timings, baselineDuration: parseInt(e.target.value) || 30})}
                  variant="professional"
                />
                <InputEnhanced 
                  type="number" 
                  min="1"
                  label="Exposure (min)" 
                  value={timings.exposureDuration}
                  onChange={(e) => setTimings({...timings, exposureDuration: parseInt(e.target.value) || 30})}
                  variant="professional"
                />
                <InputEnhanced 
                  type="number" 
                  min="0"
                  label="Stabilization (min)" 
                  value={timings.stabilizationTime}
                  onChange={(e) => setTimings({...timings, stabilizationTime: parseInt(e.target.value) || 5})}
                  variant="professional"
                />
              </div>
              
              <div className="text-xs sm:text-sm text-muted-foreground bg-primary/5 p-2 sm:p-3 rounded-xl border border-primary/20">
                <strong>Total Experiment Time:</strong> {getTotalTime()} hours
              </div>
            </CardContent>
            </CardEnhanced>
          </motion.div>
        </div>

        {/* Results Section */}
        <motion.div variants={cardVariants} whileHover="hover">
          <CardEnhanced variant="elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-lg font-light">
                <motion.div 
                  className="p-2 apple-card border-border/30"
                  whileHover={{ scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  <Calculator className="text-primary" size={18} />
                </motion.div>
                Flow Calculations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <motion.div 
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {/* MFC A */}
                <motion.div 
                  className="apple-card p-4 border-border/30"
                  variants={cardVariants}
                  whileHover={{ scale: 1.02, boxShadow: "0 8px 30px rgba(0,0,0,0.12)" }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <motion.div 
                      className="p-2 bg-blue-500/10 rounded-lg"
                      whileHover={{ rotate: 360 }}
                      transition={{ duration: 0.5 }}
                    >
                      <Wind className="text-blue-500" size={20} />
                    </motion.div>
                    <div>
                      <h3 className="font-medium text-foreground text-sm sm:text-base">MFC A</h3>
                      <p className="text-xs text-muted-foreground">Dry Air</p>
                    </div>
                  </div>
                  <div className="text-xl sm:text-2xl font-light text-foreground mb-1">
                    {results.mfcA.toFixed(2)}
                    <span className="text-xs sm:text-sm text-muted-foreground ml-1">SLPM</span>
                  </div>
                </motion.div>

                {/* MFC B */}
                <motion.div 
                  className="apple-card p-4 border-border/30"
                  variants={cardVariants}
                  whileHover={{ scale: 1.02, boxShadow: "0 8px 30px rgba(0,0,0,0.12)" }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <motion.div 
                      className="p-2 bg-cyan-500/10 rounded-lg"
                      whileHover={{ scale: 1.1, y: -2 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Droplets className="text-cyan-500" size={20} />
                    </motion.div>
                    <div>
                      <h3 className="font-medium text-foreground text-sm sm:text-base">MFC B</h3>
                      <p className="text-xs text-muted-foreground">Humid Air</p>
                    </div>
                  </div>
                  <div className="text-xl sm:text-2xl font-light text-foreground mb-1">
                    {results.mfcB.toFixed(2)}
                    <span className="text-xs sm:text-sm text-muted-foreground ml-1">SLPM</span>
                  </div>
                </motion.div>

                {/* Total Flow */}
                <motion.div 
                  className="apple-card p-4 border-border/30"
                  variants={cardVariants}
                  whileHover={{ scale: 1.02, boxShadow: "0 8px 30px rgba(0,0,0,0.12)" }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <motion.div 
                      className="p-2 bg-primary/10 rounded-lg"
                      whileHover={{ scale: 1.1 }}
                      animate={{ 
                        rotate: [0, 360],
                      }}
                      transition={{ 
                        rotate: { duration: 8, repeat: Infinity, ease: "linear" }
                      }}
                    >
                      <Activity className="text-primary" size={20} />
                    </motion.div>
                    <div>
                      <h3 className="font-medium text-foreground text-sm sm:text-base">Total Flow</h3>
                      <p className="text-xs text-muted-foreground">System Output</p>
                    </div>
                  </div>
                  <div className="text-xl sm:text-2xl font-light text-foreground mb-1">
                    <AnimatedNumber value={inputs.totalFlow} decimals={0} />
                    <span className="text-xs sm:text-sm text-muted-foreground ml-1">SLPM</span>
                  </div>
                </motion.div>
              </motion.div>

            {/* MFC C Values */}
            <AnimatePresence>
              {results.mfcC.length > 0 && (
                <motion.div 
                  className="space-y-3"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                >
                  <motion.h4 
                    className="text-sm font-medium text-muted-foreground mb-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    MFC C (CH2O) Flow Rates
                  </motion.h4>
                  <motion.div 
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                  >
                    {results.mfcC.map((item, idx) => (
                      <motion.div 
                        key={`${item.concentration}-${idx}`} 
                        className="apple-card p-3 border-border/30"
                        variants={cardVariants}
                        whileHover={{ scale: 1.03, y: -2 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="text-lg font-light text-foreground">
                              <AnimatedNumber value={item.flow} decimals={6} />
                              <span className="text-xs text-muted-foreground ml-1">SLPM</span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {item.concentration} ppb
                            </div>
                            {item.flow_desmos !== undefined && item.flow_standard !== undefined && (
                              <motion.div 
                                className="mt-2 text-xs text-muted-foreground space-y-1"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                transition={{ delay: 0.3 }}
                              >
                                <div>Standard: <AnimatedNumber value={item.flow_standard} decimals={6} /> SLPM</div>
                                <div>Desmos: <AnimatedNumber value={item.flow_desmos} decimals={6} /> SLPM</div>
                              </motion.div>
                            )}
                          </div>
                          <motion.div 
                            className="p-2 bg-orange-500/10 rounded-lg"
                            whileHover={{ rotate: [0, -10, 10, 0], scale: 1.1 }}
                            transition={{ duration: 0.5 }}
                          >
                            <Beaker className="text-orange-500" size={16} />
                          </motion.div>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </CardEnhanced>
        </motion.div>

        {/* Download Section */}
        <motion.div variants={cardVariants} whileHover="hover">
          <CardEnhanced variant="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-lg font-light">
                <motion.div 
                  className="p-2 apple-card border-border/30"
                  whileHover={{ scale: 1.1, y: -2 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  <Download className="text-primary" size={18} />
                </motion.div>
                Protocol Export
              </CardTitle>
            </CardHeader>
            <CardContent>
              <motion.div 
                className="flex items-center justify-between p-4 apple-card border-border/30 rounded-xl"
                whileHover={{ scale: 1.01 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
              >
                <div>
                  <h4 className="font-medium text-foreground">MFC Protocol File</h4>
                  <p className="text-sm text-muted-foreground">
                    Ready to download CSV file for {inputs.targetHumidity}% RH protocol
                  </p>
                </div>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <ButtonEnhanced 
                    onClick={downloadCSV}
                    disabled={!results.isValid}
                    variant="default"
                    className="flex items-center gap-2"
                  >
                    <motion.div
                      animate={{ y: [0, -2, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Download size={16} />
                    </motion.div>
                    Download CSV
                  </ButtonEnhanced>
                </motion.div>
              </motion.div>
              
              <AnimatePresence>
                {csvData && (
                  <motion.pre 
                    className="mt-4 p-4 bg-black/20 rounded-xl text-xs text-white/80 overflow-x-auto"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <code>{csvData}</code>
                  </motion.pre>
                )}
              </AnimatePresence>

            </CardContent>
          </CardEnhanced>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default function App() {
  return <MFCCalculator />;
}
