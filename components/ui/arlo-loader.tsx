export function ArloLoader({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <h1
        className="font-sans font-bold text-7xl tracking-tight text-[#111] [mask-size:300%_100%] [animation:arlo-wipe_1.2s_cubic-bezier(0.65,0,0.35,1)_infinite,arlo-blur_1.2s_cubic-bezier(0.65,0,0.35,1)_infinite]"
        style={{
          WebkitMaskImage:
            "linear-gradient(to right, #000 0%, #000 40%, transparent 55%, transparent 100%)",
          maskImage:
            "linear-gradient(to right, #000 0%, #000 40%, transparent 55%, transparent 100%)",
        }}
      >
        arlo
      </h1>
    </div>
  );
}
