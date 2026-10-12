"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CameraMode = "natural" | "dslr" | "film";

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  const [camera, setCamera] = useState<"environment" | "user">(
    "environment"
  );
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState("");
  const [mode, setMode] = useState<CameraMode>("natural");
  const [zoom, setZoom] = useState(1);
  const [exposure, setExposure] = useState(0);
  const [resolution, setResolution] = useState("Waiting for camera");
  const [flash, setFlash] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is unavailable. Open CapCam using HTTPS in a supported browser.");
      return;
    }

    stopCamera();
    setPhoto("");
    setBusy(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: camera },
          width: { ideal: 3840 },
          height: { ideal: 2160 }
        }
      });

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        return;
      }

      video.srcObject = stream;
      await video.play();

      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();

      setResolution(
        `${settings.width ?? "?"} × ${settings.height ?? "?"}`
      );

      setActive(true);
      setZoom(1);
      setExposure(0);
    } catch (err) {
      const e = err as DOMException;

      if (e.name === "NotAllowedError") {
        setError("Camera permission denied. Allow camera access in your browser settings.");
      } else if (e.name === "NotFoundError") {
        setError("No compatible camera was found.");
      } else if (e.name === "NotReadableError") {
        setError("The camera may already be in use by another application.");
      } else {
        setError(e.message || "Unable to start the camera.");
      }
    } finally {
      setBusy(false);
    }
  }, [camera, stopCamera]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const setCameraSide = (side: "environment" | "user") => {
    setCamera(side);
  };

  useEffect(() => {
    if (!active) return;
    void startCamera();
  }, [camera]);

  const applyZoom = async (value: number) => {
    setZoom(value);

    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;

    try {
      const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
        zoom?: { min: number; max: number; step?: number };
      };

      if (capabilities.zoom) {
        await track.applyConstraints({
          advanced: [{ zoom: value } as MediaTrackConstraintSet]
        });
      }
    } catch {
      // CSS preview zoom remains available if hardware zoom is unsupported.
    }
  };

  const applyExposure = async (value: number) => {
    setExposure(value);

    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;

    try {
      const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
        exposureCompensation?: {
          min: number;
          max: number;
          step?: number;
        };
      };

      const range = capabilities.exposureCompensation;
      if (range) {
        const amount = Math.min(range.max, Math.max(range.min, value));

        await track.applyConstraints({
          advanced: [
            { exposureCompensation: amount } as MediaTrackConstraintSet
          ]
        });
      }
    } catch {
      // Digital brightness is applied during photo processing below.
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !active || !video.videoWidth) {
      setError("Start the camera and wait for the preview before capturing.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      setError("Unable to create the photo.");
      return;
    }

    if (camera === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.filter = "none";
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = image.data;

    const brightness = Math.pow(2, exposure / 3);

    for (let i = 0; i < pixels.length; i += 4) {
      let r = pixels[i] * brightness;
      let g = pixels[i + 1] * brightness;
      let b = pixels[i + 2] * brightness;

      if (mode === "dslr") {
        r = (r - 128) * 1.08 + 128;
        g = (g - 128) * 1.05 + 128;
        b = (b - 128) * 1.02 + 128;
      }

      if (mode === "film") {
        r = r * 1.06 + 5;
        g = g * 1.01 + 2;
        b = b * 0.94;
      }

      pixels[i] = Math.max(0, Math.min(255, r));
      pixels[i + 1] = Math.max(0, Math.min(255, g));
      pixels[i + 2] = Math.max(0, Math.min(255, b));
    }

    ctx.putImageData(image, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Could not export this photo.");
          return;
        }

        setPhoto((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
      },
      "image/jpeg",
      0.96
    );
  };

  const downloadPhoto = () => {
    if (!photo) return;

    const link = document.createElement("a");
    link.href = photo;
    link.download = `capcam-${Date.now()}.jpg`;
    link.click();
  };

  return (
    <main className="app">
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brandIcon">C</span>
          <span>CAP<span className="accent">CAM</span></span>
        </a>

        <div className="topStatus">
          <span className={active ? "statusDot live" : "statusDot"} />
          {active ? "CAMERA READY" : "READY TO CAPTURE"}
        </div>

        <button
          className="iconButton"
          onClick={() => settingsRef.current?.scrollIntoView({
            behavior: "smooth"
          })}
          aria-label="Camera settings"
        >
          ⚙
        </button>
      </header>

      <section className="intro">
        <div className="eyebrow">YOUR CAMERA. YOUR VISION.</div>
        <h1>Capture <span>the moment.</span></h1>
        <p>Real camera access. Your creative control.</p>
      </section>

      <section className="cameraLayout">
        <div className="cameraCard">
          <div className="viewfinder">
            <video
              ref={videoRef}
              className={`cameraVideo ${camera === "user" ? "mirrored" : ""}`}
              autoPlay
              playsInline
              muted
              style={{
                transform: `scale(${zoom})`,
                filter: `brightness(${Math.pow(2, exposure / 3)})`
              }}
            />

            {!active && (
              <div className="cameraPlaceholder">
                <div className="lensIcon">◉</div>
                <h2>Your next great shot starts here.</h2>
                <p>Enable your camera to begin shooting.</p>
                <button
                  className="primaryButton"
                  onClick={() => void startCamera()}
                  disabled={busy}
                >
                  {busy ? "Starting camera…" : "Enable camera"}
                </button>
              </div>
            )}

            <div className="viewfinderCorners" />

            {active && (
              <>
                <div className="viewfinderLabel">
                  <span className="recordDot" /> LIVE PREVIEW
                </div>
                <div className="resolutionTag">{resolution}</div>
                <div className="focusMark">+</div>
              </>
            )}
          </div>

          {error && <div className="errorMessage">{error}</div>}

          <div className="cameraToolbar">
            <button
              className="secondaryButton"
              onClick={() =>
                setCameraSide(
                  camera === "environment" ? "user" : "environment"
                )
              }
              disabled={busy}
            >
              ↻ Flip
            </button>

            <button
              className="shutter"
              onClick={capturePhoto}
              disabled={!active}
              aria-label="Capture photo"
            >
              <span />
            </button>

            <button
              className={`secondaryButton ${flash ? "selected" : ""}`}
              onClick={() => setFlash(!flash)}
              title="Toggle preview grid"
            >
              {flash ? "▦ Grid on" : "▦ Grid"}
            </button>
          </div>
        </div>

        <aside className="controls" ref={settingsRef}>
          <div className="panelHeading">
            <div>
              <div className="eyebrow">CAMERA STUDIO</div>
              <h2>Pro controls</h2>
            </div>
            <span className="manualBadge">MANUAL</span>
          </div>

          <div className="controlGroup">
            <div className="controlLabel">
              <label htmlFor="zoom">Zoom</label>
              <strong>{zoom.toFixed(1)}×</strong>
            </div>
            <input
              id="zoom"
              type="range"
              min="1"
              max="3"
              step="0.1"
              value={zoom}
              onChange={(e) => void applyZoom(Number(e.target.value))}
            />
            <div className="rangeLabels">
              <span>1×</span><span>2×</span><span>3×</span>
            </div>
          </div>

          <div className="controlGroup">
            <div className="controlLabel">
              <label htmlFor="exposure">Exposure compensation</label>
              <strong>{exposure > 0 ? "+" : ""}{exposure.toFixed(1)}</strong>
            </div>
            <input
              id="exposure"
              type="range"
              min="-2"
              max="2"
              step="0.5"
              value={exposure}
              onChange={(e) => void applyExposure(Number(e.target.value))}
            />
            <div className="rangeLabels">
              <span>−2</span><span>0</span><span>+2</span>
            </div>
          </div>

          <div className="controlGroup">
            <div className="controlLabel">
              <label>Image profile</label>
              <strong className="accent">{mode.toUpperCase()}</strong>
            </div>

            <div className="profileGrid">
              {(["natural", "dslr", "film"] as CameraMode[]).map((item) => (
                <button
                  key={item}
                  className={`profileButton ${mode === item ? "profileActive" : ""}`}
                  onClick={() => setMode(item)}
                >
                  <span className={`profileSwatch ${item}`} />
                  <span>{item === "dslr" ? "DSLR" : item.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="qualityInfo">
            <div className="qualityIcon">✓</div>
            <div>
              <strong>Actual camera resolution</strong>
              <p>{resolution}</p>
              <small>Requested up to 4K; device limits apply.</small>
            </div>
          </div>

          <button
            className="primaryButton fullButton"
            onClick={capturePhoto}
            disabled={!active}
          >
            Capture photo <span>↗</span>
          </button>

          <button
            className="textButton"
            onClick={stopCamera}
            disabled={!active}
          >
            Turn off camera
          </button>
        </aside>
      </section>

      {photo && (
        <section className="photoResult">
          <div className="resultHeader">
            <div>
              <div className="eyebrow">CAPTURE COMPLETE</div>
              <h2>Your photograph</h2>
            </div>
            <button className="primaryButton" onClick={downloadPhoto}>
              ↓ Download JPG
            </button>
          </div>

          <img src={photo} alt="Your captured CapCam photograph" />

          <p className="resultNote">
            This image uses the selected software color profile. Keep your
            original camera files if you need an untouched reference.
          </p>
        </section>
      )}

      <canvas ref={canvasRef} className="hiddenCanvas" />

      <footer className="footer">
        <a className="brand footerBrand" href="#">
          <span className="brandIcon">C</span>
          CAP<span className="accent">CAM</span>
        </a>
        <span>Made for people who love photography.</span>
        <span>© {new Date().getFullYear()} CAPCAM</span>
      </footer>
    </main>
  );
}
