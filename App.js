import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useMicrophonePermission } from 'react-native-vision-camera';
import * as MediaLibrary from 'expo-media-library';

export default function App() {
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();
  const { hasPermission: hasMicrophonePermission, requestPermission: requestMicrophonePermission } = useMicrophonePermission();
  const [mediaPermissionResponse, requestMediaPermission] = MediaLibrary.usePermissions();
  
  const [cameraPosition, setCameraPosition] = useState('back');
  const device = useCameraDevice(cameraPosition);
  
  const cameraRef = useRef(null);
  
  const [isRecordingUI, setIsRecordingUI] = useState(false);
  const [isFlippingUI, setIsFlippingUI] = useState(false);
  const [segmentsCount, setSegmentsCount] = useState(0);
  
  const isRecordingRef = useRef(false);
  const pendingFlipRef = useRef(false);
  const segmentsRef = useRef([]);

  useEffect(() => {
    (async () => {
      if (!hasCameraPermission) await requestCameraPermission();
      if (!hasMicrophonePermission) await requestMicrophonePermission();
      if (mediaPermissionResponse?.status !== 'granted') await requestMediaPermission();
    })();
  }, [hasCameraPermission, hasMicrophonePermission, mediaPermissionResponse]);

  const startRecording = async () => {
    if (!cameraRef.current || !device) return;
    isRecordingRef.current = true;
    setIsRecordingUI(true);
    segmentsRef.current = [];
    setSegmentsCount(0);
    recordSegment();
  };
  
  const recordSegment = () => {
    if (!cameraRef.current || !isRecordingRef.current) return;
    
    try {
      cameraRef.current.startRecording({
        onRecordingFinished: async (video) => {
          segmentsRef.current.push(video.path);
          setSegmentsCount(segmentsRef.current.length);
          
          // Save to Gallery immediately
          try {
             const localUri = video.path.startsWith('file://') ? video.path : 'file://' + video.path;
             await MediaLibrary.saveToLibraryAsync(localUri);
          } catch(e) { 
             alert("Failed to save to gallery: " + String(e)); 
          }
          
          // If we were just waiting to flip, do it NOW safely!
          if (pendingFlipRef.current) {
            pendingFlipRef.current = false;
            setCameraPosition(p => p === 'back' ? 'front' : 'back');
            // The useEffect below will catch the camera swap and restart recording
          } 
          // If we intentionally stopped and are completely done
          else if (!isRecordingRef.current) {
            alert(`POC SUCCESS!\nSuccessfully safely saved ${segmentsRef.current.length} hot-swapped clips to Gallery!`);
          }
        },
        onRecordingError: (error) => {
          alert("Recording Error: " + error.message);
          setIsRecordingUI(false);
          isRecordingRef.current = false;
          setIsFlippingUI(false);
          pendingFlipRef.current = false;
        },
      });
    } catch (e) {
      alert("Start Error: " + e.message);
    }
  };

  const stopRecording = async () => {
    if (!cameraRef.current || !isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecordingUI(false);
    
    try {
      await cameraRef.current.stopRecording();
    } catch (e) { alert("Stop Error: " + e.message); }
  };

  const flipCamera = async () => {
    if (!isRecordingRef.current) {
      // Just flip normally if not recording
      setCameraPosition(p => p === 'back' ? 'front' : 'back');
      return;
    }
    
    if (isFlippingUI) return; // Prevent spamming
    
    // SAFE FLIP LOGIC:
    // We cannot forcefully rip the hardware out. We MUST politely stop the video, 
    // wait for it to save to disk, and ONLY THEN swap the camera lens.
    setIsFlippingUI(true);
    pendingFlipRef.current = true;
    
    try {
      await cameraRef.current.stopRecording();
    } catch (e) { 
      alert("Flip Stop Error: " + e.message); 
      setIsFlippingUI(false);
      pendingFlipRef.current = false;
    }
  };

  // When the camera physically changes, check if we need to auto-resume recording
  useEffect(() => {
    if (isRecordingRef.current && device) {
      // Give the new hardware 500ms to warm up to prevent crashes
      const timer = setTimeout(() => {
        setIsFlippingUI(false);
        recordSegment();
      }, 500); 
      return () => clearTimeout(timer);
    }
  }, [cameraPosition, device]);

  if (!hasCameraPermission || !hasMicrophonePermission) {
    return (
      <View style={styles.container}>
        <Text style={{color: 'white', alignSelf: 'center'}}>Requesting permissions...</Text>
      </View>
    );
  }

  if (device == null) return <View style={styles.container}><ActivityIndicator size="large" color="white" /></View>;

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        video={true}
        audio={true}
      />
      
      {/* Overlay UI */}
      <View style={styles.controls}>
        {isFlippingUI ? (
           <ActivityIndicator size="large" color="white" />
        ) : (
          <>
            <TouchableOpacity style={styles.flipBtn} onPress={flipCamera}>
              <Text style={styles.text}>FLIP</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.recordBtn, isRecordingUI && styles.recordingActive]} 
              onPress={isRecordingUI ? stopRecording : startRecording}
            >
              <Text style={styles.text}>{isRecordingUI ? 'STOP' : 'REC'}</Text>
            </TouchableOpacity>
            
            <View style={{width: 60, alignItems: 'center'}}>
               {segmentsCount > 0 && <Text style={{color:'white'}}>Saved: {segmentsCount}</Text>}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
  },
  controls: {
    position: 'absolute',
    bottom: 50,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  recordBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'red',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'white',
  },
  recordingActive: {
    backgroundColor: 'darkred',
    borderRadius: 20,
  },
  flipBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: 'white',
    fontWeight: 'bold',
  }
});
