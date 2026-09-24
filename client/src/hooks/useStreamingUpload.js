import { useState, useRef, useCallback } from 'react';

export function useStreamingUpload(options = {}) {
  const {
    apiEndpoint = '/api/upload/stream',
    fieldName = 'file'
  } = options;

  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [bytesUploaded, setBytesUploaded] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [uploadSpeedMBps, setUploadSpeedMBps] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState(0);
  const [error, setError] = useState(null);
  const [serverResponse, setServerResponse] = useState(null);

  const xhrRef = useRef(null);
  const simTimerRef = useRef(null);
  const lastTimeRef = useRef(0);
  const lastLoadedRef = useRef(0);

  const resetUpload = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
    setStatus('idle');
    setProgress(0);
    setBytesUploaded(0);
    setTotalBytes(0);
    setUploadSpeedMBps(0);
    setEtaSeconds(0);
    setError(null);
    setServerResponse(null);
  }, []);

  const abortUpload = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
    setStatus('aborted');
    setError('Upload was cancelled.');
  }, []);

  const startUpload = useCallback(async (file, useSimulation = false) => {
    if (!file) return;

    resetUpload();
    setStatus('uploading');
    setTotalBytes(file.size);
    lastTimeRef.current = performance.now();
    lastLoadedRef.current = 0;

    if (useSimulation) {
      let currentLoaded = 0;
      const stepBytes = Math.max(65536, Math.floor(file.size / 40));
      const intervalMs = 100;

      simTimerRef.current = setInterval(() => {
        currentLoaded = Math.min(file.size, currentLoaded + stepBytes);
        const now = performance.now();
        const timeDiff = (now - lastTimeRef.current) / 1000;
        const bytesDiff = currentLoaded - lastLoadedRef.current;

        const speed = timeDiff > 0 ? (bytesDiff / (1024 * 1024 * timeDiff)) : 0;
        const pct = Math.min(100, Math.round((currentLoaded / file.size) * 100));
        const remainingBytes = file.size - currentLoaded;
        const remainingSpeedBytes = speed * 1024 * 1024;
        const eta = remainingSpeedBytes > 0 ? Math.ceil(remainingBytes / remainingSpeedBytes) : 0;

        lastTimeRef.current = now;
        lastLoadedRef.current = currentLoaded;

        setProgress(pct);
        setBytesUploaded(currentLoaded);
        setUploadSpeedMBps(parseFloat(speed.toFixed(2)));
        setEtaSeconds(eta);

        if (currentLoaded >= file.size) {
          clearInterval(simTimerRef.current);
          simTimerRef.current = null;
          setStatus('completed');
          setProgress(100);
          setServerResponse({
            status: 'success',
            mode: 'simulated_stream',
            message: 'Stream completed successfully.',
            bytesReceived: file.size,
            filename: file.name
          });
        }
      }, intervalMs);
      return;
    }

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    const formData = new FormData();
    formData.append(fieldName, file, file.name);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const loaded = event.loaded;
        const total = event.total || file.size;
        const now = performance.now();
        const timeDiff = (now - lastTimeRef.current) / 1000;
        const bytesDiff = loaded - lastLoadedRef.current;

        if (timeDiff >= 0.2) {
          const speed = bytesDiff / (1024 * 1024 * timeDiff);
          const remainingBytes = total - loaded;
          const speedBytes = speed * 1024 * 1024;
          const eta = speedBytes > 0 ? Math.ceil(remainingBytes / speedBytes) : 0;

          setUploadSpeedMBps(parseFloat(speed.toFixed(2)));
          setEtaSeconds(eta);
          lastTimeRef.current = now;
          lastLoadedRef.current = loaded;
        }

        const pct = Math.min(100, Math.round((loaded / total) * 100));
        setProgress(pct);
        setBytesUploaded(loaded);
        setTotalBytes(total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const responseData = JSON.parse(xhr.responseText);
          setServerResponse(responseData);
        } catch {
          setServerResponse({ message: xhr.responseText || 'Upload successful' });
        }
        setStatus('completed');
        setProgress(100);
      } else {
        setStatus('error');
        setError(`Backend responded with HTTP ${xhr.status}: ${xhr.statusText || 'Upload failed'}`);
      }
    };

    xhr.onerror = () => {
      setStatus('error');
      setError('Connection to backend failed. Make sure the server is running on http://localhost:5000, or enable Simulated Stream mode.');
    };

    xhr.onabort = () => {
      setStatus('aborted');
      setError('Upload stream aborted.');
    };

    try {
      xhr.open('POST', apiEndpoint, true);
      xhr.send(formData);
    } catch (err) {
      setStatus('error');
      setError(`Failed to initiate upload: ${err.message}`);
    }
  }, [apiEndpoint, fieldName, resetUpload]);

  return {
    status,
    progress,
    bytesUploaded,
    totalBytes,
    uploadSpeedMBps,
    etaSeconds,
    error,
    serverResponse,
    startUpload,
    abortUpload,
    resetUpload
  };
}
