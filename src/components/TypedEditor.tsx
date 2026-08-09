import { useRef, useState } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImagePlus, Trash2, ArrowUp, ArrowDown, Mic, ShieldAlert } from "lucide-react";

export type ImageBlock = {
  id: string;
  path: string;
  url: string;
  caption: string;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  blocks: ImageBlock[];
  onBlocksChange: (b: ImageBlock[]) => void;
  allowImages: boolean;
  allowAutocorrect: boolean;
  allowVoice: boolean;
  disabled?: boolean;
  onViolation: (kind: string) => void;
  violations: number;
  onUploadImage: (file: File) => Promise<ImageBlock | null>;
};

export function TypedEditor({
  value,
  onChange,
  blocks,
  onBlocksChange,
  allowImages,
  allowAutocorrect,
  allowVoice,
  disabled,
  onViolation,
  violations,
  onUploadImage,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  function block(kind: string, label: string) {
    toast.warning(`${label} is disabled on this assignment`, {
      description: "This attempt has been recorded and is visible to your teacher.",
      icon: <ShieldAlert className="size-4" />,
    });
    onViolation(kind);
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    if (!allowImages) {
      toast.error("Images are disabled on this assignment");
      return;
    }
    setUploading(true);
    const added: ImageBlock[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const b = await onUploadImage(file);
      if (b) added.push(b);
    }
    setUploading(false);
    if (added.length) onBlocksChange([...blocks, ...added]);
  }

  function move(idx: number, dir: -1 | 1) {
    const next = [...blocks];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    onBlocksChange(next);
  }

  // Voice typing stays on until the student turns it off. Browsers end a
  // recognition session after every pause, so the `stopped` flag decides
  // whether `onend` restarts it or lets it die.
  const recRef = useRef<any>(null);
  const stoppedRef = useRef(true);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      try {
        recRef.current?.stop();
      } catch {
        /* recognition already ended */
      }
    };
  }, []);

  function startVoice() {
    const SR =
      (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition ??
      (window as unknown as { SpeechRecognition?: new () => any }).SpeechRecognition;
    if (!SR) {
      toast.error("Voice typing isn't supported in this browser");
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (e: any) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript;
      }
      text = text.trim();
      if (!text) return;
      const current = valueRef.current;
      onChangeRef.current(current ? `${current} ${text}` : text);
    };
    rec.onerror = (e: any) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        stoppedRef.current = true;
        setListening(false);
        toast.error("Microphone access is blocked");
      }
      // "no-speech"/"aborted" are normal pauses — onend restarts them.
    };
    rec.onend = () => {
      if (stoppedRef.current) return;
      try {
        rec.start();
      } catch {
        /* start() throws if it is already running */
      }
    };
    recRef.current = rec;
    stoppedRef.current = false;
    try {
      rec.start();
      setListening(true);
      toast.info("Voice typing on — it stays on until you turn it off");
    } catch {
      toast.error("Could not start voice typing");
    }
  }

  function stopVoice() {
    stoppedRef.current = true;
    setListening(false);
    try {
      recRef.current?.stop();
    } catch {
      /* already stopped */
    }
  }


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
          Paste protection on
        </span>
        {violations > 0 && (
          <span className="rounded-full border border-destructive/40 bg-destructive/15 px-2.5 py-0.5 text-xs font-medium text-destructive">
            {violations} blocked attempt{violations === 1 ? "" : "s"} flagged
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {allowVoice && (
            <Button type="button" variant="outline" size="sm" onClick={voiceType}>
              <Mic className="mr-1.5 size-3.5" /> Voice
            </Button>
          )}
          {allowImages && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="mr-1.5 size-3.5" /> Insert image
            </Button>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      <Textarea
        value={value}
        disabled={disabled}
        spellCheck={allowAutocorrect}
        autoCorrect={allowAutocorrect ? "on" : "off"}
        autoCapitalize={allowAutocorrect ? "sentences" : "off"}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => {
          e.preventDefault();
          block("paste", "Pasting");
        }}
        onCopy={(e) => {
          e.preventDefault();
          block("copy", "Copying");
        }}
        onCut={(e) => {
          e.preventDefault();
          block("cut", "Cutting");
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          block("contextmenu", "The right-click menu");
        }}
        onDragStart={(e) => {
          e.preventDefault();
          block("dragstart", "Dragging text");
        }}
        onDrop={(e) => {
          const files = e.dataTransfer.files;
          if (files?.length && allowImages) {
            e.preventDefault();
            void handleFiles(files);
            return;
          }
          e.preventDefault();
          block("drop", "Dropping text");
        }}
        onKeyDown={(e) => {
          const mod = e.ctrlKey || e.metaKey;
          if (mod && ["v", "c", "x"].includes(e.key.toLowerCase())) {
            e.preventDefault();
            block(`key-${e.key.toLowerCase()}`, "That shortcut");
          }
        }}
        placeholder="Write your answer here. Pasting is disabled."
        className="min-h-[320px] resize-y font-normal leading-7"
      />

      {allowImages && blocks.length > 0 && (
        <div className="space-y-3">
          {blocks.map((b, i) => (
            <div key={b.id} className="panel flex gap-3 p-3">
              <img
                src={b.url}
                alt={b.caption || "Inserted illustration"}
                className="size-24 rounded-md object-cover"
              />
              <div className="flex-1 space-y-2">
                <Input
                  value={b.caption}
                  maxLength={160}
                  placeholder="Caption"
                  onChange={(e) => {
                    const next = [...blocks];
                    next[i] = { ...b, caption: e.target.value };
                    onBlocksChange(next);
                  }}
                />
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => move(i, -1)}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => move(i, 1)}>
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onBlocksChange(blocks.filter((x) => x.id !== b.id))}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
