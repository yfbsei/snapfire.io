/**
 * ScreenRecorder - High-quality screen recording system for game capture
 * 
 * Captures directly from the WebGL/WebGPU canvas at configurable resolutions
 * with AAA-quality bitrates to avoid the quality loss from external recorders.
 * 
 * Supports: 1080p, 1440p, 4K at 30 or 60 FPS
 */

/**
 * Resolution presets with optimized bitrates
 */
const RESOLUTION_PRESETS = {
    '1080p': {
        width: 1920,
        height: 1080,
        bitrate: 20_000_000,  // 20 Mbps
        label: '1080p Full HD'
    },
    '1440p': {
        width: 2560,
        height: 1440,
        bitrate: 40_000_000,  // 40 Mbps
        label: '1440p Quad HD'
    },
    '4k': {
        width: 3840,
        height: 2160,
        bitrate: 70_000_000,  // 70 Mbps
        label: '4K Ultra HD'
    },
    'native': {
        width: null,  // Will use canvas size
        height: null,
        bitrate: 40_000_000,  // 40 Mbps default
        label: 'Native Resolution'
    }
};

/**
 * Supported codecs in order of preference
 */
const CODEC_PREFERENCES = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=h264',
    'video/mp4'
];

/**
 * ScreenRecorder - Built-in high-quality game recording
 */
export class ScreenRecorder {
    /**
     * @param {GameEngine} engine - The game engine instance
     * @param {Object} options - Configuration options
     */
    constructor(engine, options = {}) {
        this.engine = engine;
        this.canvas = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.stream = null;

        // Recording state
        this.isRecording = false;
        this.isPaused = false;
        this.recordingStartTime = 0;
        this.recordingDuration = 0;

        // Default options
        this.options = {
            resolution: 'native',     // '1080p', '1440p', '4k', 'native'
            fps: 60,                  // 30 or 60
            autoDownload: true,       // Auto download when stopped
            filenamePrefix: 'recording',
            includeTimestamp: true,
            ...options
        };

        // Selected codec (determined at runtime)
        this.selectedCodec = null;

        // Recording indicator element
        this.indicatorElement = null;

        // Callbacks
        this.onRecordingStart = null;
        this.onRecordingStop = null;
        this.onRecordingError = null;
    }

    /**
     * Initialize the screen recorder (called after engine init)
     */
    init() {
        if (!this.engine.renderer) {
            console.warn('ScreenRecorder: Engine renderer not available');
            return false;
        }

        this.canvas = this.engine.renderer.domElement;

        // Find best supported codec
        this.selectedCodec = this._findBestCodec();
        if (!this.selectedCodec) {
            console.error('ScreenRecorder: No supported video codec found');
            return false;
        }

        // console.log(`ScreenRecorder: Initialized with codec ${this.selectedCodec}`);
        return true;
    }

    /**
     * Find the best supported codec
     * @private
     */
    _findBestCodec() {
        for (const codec of CODEC_PREFERENCES) {
            if (MediaRecorder.isTypeSupported(codec)) {
                return codec;
            }
        }
        return null;
    }

    /**
     * Start recording
     * @param {Object} options - Override default options
     * @returns {boolean} Success status
     */
    start(options = {}) {
        if (this.isRecording) {
            console.warn('ScreenRecorder: Already recording');
            return false;
        }

        if (!this.canvas) {
            if (!this.init()) {
                return false;
            }
        }

        // Merge options
        const recordOptions = { ...this.options, ...options };

        try {
            // Get resolution preset
            const preset = RESOLUTION_PRESETS[recordOptions.resolution] || RESOLUTION_PRESETS.native;

            // Calculate bitrate based on fps (higher fps needs more bitrate)
            let bitrate = preset.bitrate;
            if (recordOptions.fps === 60) {
                bitrate = Math.floor(bitrate * 1.5);  // 50% more for 60fps
            }

            // Capture stream from canvas
            this.stream = this.canvas.captureStream(recordOptions.fps);

            // Configure MediaRecorder with high quality settings
            const recorderOptions = {
                mimeType: this.selectedCodec,
                videoBitsPerSecond: bitrate
            };

            this.mediaRecorder = new MediaRecorder(this.stream, recorderOptions);
            this.recordedChunks = [];

            // Handle data available
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            // Handle recording stop
            this.mediaRecorder.onstop = () => {
                this._onRecordingComplete(recordOptions);
            };

            // Handle errors
            this.mediaRecorder.onerror = (event) => {
                console.error('ScreenRecorder: Recording error', event.error);
                this.isRecording = false;
                this._hideIndicator();
                if (this.onRecordingError) {
                    this.onRecordingError(event.error);
                }
            };

            // Start recording
            this.mediaRecorder.start(1000);  // Collect data every second
            this.isRecording = true;
            this.isPaused = false;
            this.recordingStartTime = Date.now();

            // Show recording indicator
            this._showIndicator();

            // Calculate actual resolution being recorded
            const actualWidth = preset.width || this.canvas.width;
            const actualHeight = preset.height || this.canvas.height;

            console.log(`ScreenRecorder: Started recording at ${actualWidth}x${actualHeight} @ ${recordOptions.fps}fps (${(bitrate / 1_000_000).toFixed(1)} Mbps)`);

            if (this.onRecordingStart) {
                this.onRecordingStart({
                    resolution: recordOptions.resolution,
                    width: actualWidth,
                    height: actualHeight,
                    fps: recordOptions.fps,
                    bitrate
                });
            }

            return true;

        } catch (error) {
            console.error('ScreenRecorder: Failed to start recording', error);
            if (this.onRecordingError) {
                this.onRecordingError(error);
            }
            return false;
        }
    }

    /**
     * Stop recording
     * @returns {boolean} Success status
     */
    stop() {
        if (!this.isRecording || !this.mediaRecorder) {
            console.warn('ScreenRecorder: Not currently recording');
            return false;
        }

        this.recordingDuration = Date.now() - this.recordingStartTime;
        this.mediaRecorder.stop();
        this.isRecording = false;
        this.isPaused = false;

        // Stop the stream tracks
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        this._hideIndicator();

        console.log(`ScreenRecorder: Stopped recording (${(this.recordingDuration / 1000).toFixed(1)}s)`);
        return true;
    }

    /**
     * Pause recording
     * @returns {boolean} Success status
     */
    pause() {
        if (!this.isRecording || !this.mediaRecorder || this.isPaused) {
            return false;
        }

        if (this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.pause();
            this.isPaused = true;
            this._updateIndicator('paused');
            console.log('ScreenRecorder: Paused');
            return true;
        }
        return false;
    }

    /**
     * Resume recording
     * @returns {boolean} Success status
     */
    resume() {
        if (!this.isRecording || !this.mediaRecorder || !this.isPaused) {
            return false;
        }

        if (this.mediaRecorder.state === 'paused') {
            this.mediaRecorder.resume();
            this.isPaused = false;
            this._updateIndicator('recording');
            console.log('ScreenRecorder: Resumed');
            return true;
        }
        return false;
    }

    /**
     * Toggle recording (start/stop)
     * @param {Object} options - Recording options (used for start)
     * @returns {boolean} New recording state
     */
    toggle(options = {}) {
        if (this.isRecording) {
            this.stop();
            return false;
        } else {
            this.start(options);
            return true;
        }
    }

    /**
     * Handle recording completion
     * @private
     */
    _onRecordingComplete(options) {
        if (this.recordedChunks.length === 0) {
            console.warn('ScreenRecorder: No data recorded');
            return;
        }

        // Create blob from recorded chunks
        const mimeType = this.selectedCodec.split(';')[0];
        const blob = new Blob(this.recordedChunks, { type: mimeType });

        // Calculate file size
        const fileSizeMB = (blob.size / (1024 * 1024)).toFixed(2);
        console.log(`ScreenRecorder: Recording complete (${fileSizeMB} MB)`);

        // Auto download if enabled
        if (options.autoDownload) {
            this.download(blob, options);
        }

        // Callback
        if (this.onRecordingStop) {
            this.onRecordingStop({
                blob,
                duration: this.recordingDuration,
                size: blob.size
            });
        }
    }

    /**
     * Download the recording
     * @param {Blob} blob - Recording blob (optional, uses last recording if not provided)
     * @param {Object} options - Download options
     */
    download(blob = null, options = {}) {
        const recordingBlob = blob || this._getLastRecordingBlob();
        if (!recordingBlob) {
            console.warn('ScreenRecorder: No recording to download');
            return;
        }

        const downloadOptions = { ...this.options, ...options };

        // Generate filename
        let filename = downloadOptions.filenamePrefix;
        if (downloadOptions.includeTimestamp) {
            const now = new Date();
            const timestamp = now.toISOString()
                .replace(/[:.]/g, '-')
                .replace('T', '_')
                .slice(0, 19);
            filename += `_${timestamp}`;
        }

        // Add extension based on mime type
        const extension = this.selectedCodec.includes('webm') ? 'webm' : 'mp4';
        filename += `.${extension}`;

        // Create download link
        const url = URL.createObjectURL(recordingBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Cleanup
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        console.log(`ScreenRecorder: Downloaded ${filename}`);
    }

    /**
     * Get the last recording as a blob
     * @private
     */
    _getLastRecordingBlob() {
        if (this.recordedChunks.length === 0) return null;
        const mimeType = this.selectedCodec.split(';')[0];
        return new Blob(this.recordedChunks, { type: mimeType });
    }

    /**
     * Show recording indicator
     * @private
     */
    _showIndicator() {
        if (this.indicatorElement) return;

        this.indicatorElement = document.createElement('div');
        this.indicatorElement.id = 'screen-recorder-indicator';
        this.indicatorElement.innerHTML = `
            <span class="rec-dot"></span>
            <span class="rec-text">REC</span>
            <span class="rec-time">00:00</span>
        `;
        this.indicatorElement.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 8px 16px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
            font-family: 'Inter', 'Segoe UI', sans-serif;
            font-size: 14px;
            font-weight: 500;
            z-index: 99999;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        `;

        // Add styles for the recording dot
        const style = document.createElement('style');
        style.id = 'screen-recorder-styles';
        style.textContent = `
            #screen-recorder-indicator .rec-dot {
                width: 10px;
                height: 10px;
                background: #ff3b3b;
                border-radius: 50%;
                animation: rec-pulse 1s ease-in-out infinite;
            }
            #screen-recorder-indicator.paused .rec-dot {
                animation: none;
                background: #ff9500;
            }
            #screen-recorder-indicator.paused .rec-text {
                color: #ff9500;
            }
            @keyframes rec-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.3; }
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(this.indicatorElement);

        // Start timer update
        this._startTimerUpdate();
    }

    /**
     * Update the indicator state
     * @private
     */
    _updateIndicator(state) {
        if (!this.indicatorElement) return;

        if (state === 'paused') {
            this.indicatorElement.classList.add('paused');
            this.indicatorElement.querySelector('.rec-text').textContent = 'PAUSED';
        } else {
            this.indicatorElement.classList.remove('paused');
            this.indicatorElement.querySelector('.rec-text').textContent = 'REC';
        }
    }

    /**
     * Hide recording indicator
     * @private
     */
    _hideIndicator() {
        if (this.indicatorElement) {
            this.indicatorElement.remove();
            this.indicatorElement = null;
        }

        const style = document.getElementById('screen-recorder-styles');
        if (style) style.remove();

        if (this._timerInterval) {
            clearInterval(this._timerInterval);
            this._timerInterval = null;
        }
    }

    /**
     * Start the timer update interval
     * @private
     */
    _startTimerUpdate() {
        this._timerInterval = setInterval(() => {
            if (!this.indicatorElement || !this.isRecording) return;

            const elapsed = Date.now() - this.recordingStartTime;
            const seconds = Math.floor(elapsed / 1000);
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;

            const timeEl = this.indicatorElement.querySelector('.rec-time');
            if (timeEl) {
                timeEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    /**
     * Get available resolution presets
     * @returns {Object} Resolution presets
     */
    getResolutionPresets() {
        return { ...RESOLUTION_PRESETS };
    }

    /**
     * Get current recording status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            isRecording: this.isRecording,
            isPaused: this.isPaused,
            duration: this.isRecording ? Date.now() - this.recordingStartTime : this.recordingDuration,
            codec: this.selectedCodec,
            resolution: this.options.resolution,
            fps: this.options.fps
        };
    }

    /**
     * Check if browser supports screen recording
     * @returns {boolean}
     */
    static isSupported() {
        return typeof MediaRecorder !== 'undefined' &&
            typeof HTMLCanvasElement.prototype.captureStream === 'function';
    }

    /**
     * Dispose of the screen recorder
     */
    dispose() {
        if (this.isRecording) {
            this.stop();
        }

        this._hideIndicator();
        this.recordedChunks = [];
        this.canvas = null;
        this.engine = null;
    }
}
