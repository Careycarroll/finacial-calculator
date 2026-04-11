function getReferenceShape(id) {
  const shapes = {
    "long-call": {
      line: [
        { x: 0.05, y: 0.35 },
        { x: 0.45, y: 0.35 },
        { x: 0.45, y: 0.5 },
        { x: 0.95, y: 0.9 },
      ],
      arrows: [{ x: 0.95, y: 0.9, dir: "up-right" }],
      strikes: [{ at: 0.45, label: "Strike" }],
      breakevens: [{ at: 0.52, label: "Breakeven" }],
      zones: [
        {
          from: 0.0,
          to: 0.45,
          label: "OTM",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
        {
          from: 0.45,
          to: 1.0,
          label: "ITM",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
      ],
      annotations: [
        {
          x: 0.2,
          y: 0.4,
          text: "Max Loss: Premium",
          color: "#f472b6",
          bold: true,
        },
        {
          x: 0.8,
          y: 0.75,
          text: "Unlimited Profit ↗",
          color: "#4ade80",
          bold: true,
        },
      ],
    },
    "long-put": {
      line: [
        { x: 0.05, y: 0.9 },
        { x: 0.5, y: 0.5 },
        { x: 0.55, y: 0.35 },
        { x: 0.95, y: 0.35 },
      ],
      arrows: [{ x: 0.05, y: 0.9, dir: "up-left" }],
      strikes: [{ at: 0.55, label: "Strike" }],
      breakevens: [{ at: 0.48, label: "Breakeven" }],
      zones: [
        {
          from: 0.0,
          to: 0.55,
          label: "ITM",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
        {
          from: 0.55,
          to: 1.0,
          label: "OTM",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
      ],
      annotations: [
        {
          x: 0.8,
          y: 0.4,
          text: "Max Loss: Premium",
          color: "#f472b6",
          bold: true,
        },
        {
          x: 0.2,
          y: 0.75,
          text: "Profit as stock falls ↙",
          color: "#4ade80",
          bold: true,
        },
      ],
    },
    "short-call": {
      line: [
        { x: 0.05, y: 0.65 },
        { x: 0.45, y: 0.65 },
        { x: 0.45, y: 0.5 },
        { x: 0.95, y: 0.1 },
      ],
      arrows: [{ x: 0.95, y: 0.1, dir: "down-right" }],
      strikes: [{ at: 0.45, label: "Strike" }],
      breakevens: [{ at: 0.52, label: "Breakeven" }],
      zones: [
        {
          from: 0.0,
          to: 0.45,
          label: "OTM (Safe)",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
        {
          from: 0.45,
          to: 1.0,
          label: "ITM (Risk)",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
      ],
      annotations: [
        {
          x: 0.2,
          y: 0.6,
          text: "Max Profit: Premium",
          color: "#4ade80",
          bold: true,
        },
        {
          x: 0.8,
          y: 0.25,
          text: "Unlimited Loss ↘",
          color: "#f472b6",
          bold: true,
        },
      ],
    },
    "short-put": {
      line: [
        { x: 0.05, y: 0.1 },
        { x: 0.5, y: 0.5 },
        { x: 0.55, y: 0.65 },
        { x: 0.95, y: 0.65 },
      ],
      arrows: [{ x: 0.05, y: 0.1, dir: "down-left" }],
      strikes: [{ at: 0.55, label: "Strike" }],
      breakevens: [{ at: 0.48, label: "Breakeven" }],
      zones: [
        {
          from: 0.0,
          to: 0.55,
          label: "ITM (Risk)",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
        {
          from: 0.55,
          to: 1.0,
          label: "OTM (Safe)",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
      ],
      annotations: [
        {
          x: 0.8,
          y: 0.6,
          text: "Max Profit: Premium",
          color: "#4ade80",
          bold: true,
        },
        { x: 0.2, y: 0.25, text: "Large Loss ↙", color: "#f472b6", bold: true },
      ],
    },
    "covered-call": {
      line: [
        { x: 0.05, y: 0.1 },
        { x: 0.55, y: 0.65 },
        { x: 0.55, y: 0.7 },
        { x: 0.95, y: 0.7 },
      ],
      strikes: [{ at: 0.55, label: "Strike" }],
      breakevens: [{ at: 0.35, label: "Breakeven" }],
      zones: [
        {
          from: 0.0,
          to: 0.55,
          label: "Call OTM",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
        {
          from: 0.55,
          to: 1.0,
          label: "Call ITM (Capped)",
          color: "rgba(245, 158, 11, 0.08)",
          textColor: "#f59e0b",
        },
      ],
      annotations: [
        {
          x: 0.8,
          y: 0.65,
          text: "Max Profit (Capped)",
          color: "#4ade80",
          bold: true,
        },
        {
          x: 0.15,
          y: 0.25,
          text: "Loss if stock drops",
          color: "#f472b6",
          bold: true,
        },
      ],
    },
    "protective-put": {
      line: [
        { x: 0.05, y: 0.3 },
        { x: 0.35, y: 0.3 },
        { x: 0.35, y: 0.35 },
        { x: 0.95, y: 0.9 },
      ],
      arrows: [{ x: 0.95, y: 0.9, dir: "up-right" }],
      strikes: [{ at: 0.35, label: "Put Strike" }],
      breakevens: [{ at: 0.45, label: "Breakeven" }],
      zones: [
        {
          from: 0.0,
          to: 0.35,
          label: "Protected",
          color: "rgba(168, 85, 247, 0.08)",
          textColor: "#a855f7",
        },
        {
          from: 0.35,
          to: 1.0,
          label: "Upside",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
      ],
      annotations: [
        {
          x: 0.15,
          y: 0.25,
          text: "Max Loss (Limited)",
          color: "#f472b6",
          bold: true,
        },
        {
          x: 0.75,
          y: 0.75,
          text: "Unlimited Profit ↗",
          color: "#4ade80",
          bold: true,
        },
      ],
    },
    "cash-secured-put": {
      line: [
        { x: 0.05, y: 0.1 },
        { x: 0.5, y: 0.5 },
        { x: 0.55, y: 0.65 },
        { x: 0.95, y: 0.65 },
      ],
      strikes: [{ at: 0.55, label: "Strike" }],
      breakevens: [{ at: 0.48, label: "Breakeven" }],
      zones: [
        {
          from: 0.0,
          to: 0.55,
          label: "ITM (Assigned)",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
        {
          from: 0.55,
          to: 1.0,
          label: "OTM (Keep Premium)",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
      ],
      annotations: [
        {
          x: 0.8,
          y: 0.6,
          text: "Max Profit: Premium",
          color: "#4ade80",
          bold: true,
        },
        {
          x: 0.15,
          y: 0.25,
          text: "Risk: Buy at Strike",
          color: "#f472b6",
          bold: true,
        },
      ],
    },
    "bull-call-spread": {
      line: [
        { x: 0.05, y: 0.3 },
        { x: 0.35, y: 0.3 },
        { x: 0.65, y: 0.7 },
        { x: 0.95, y: 0.7 },
      ],
      strikes: [
        { at: 0.35, label: "Lower Strike" },
        { at: 0.65, label: "Upper Strike" },
      ],
      breakevens: [{ at: 0.42, label: "Breakeven" }],
      zones: [
        {
          from: 0.0,
          to: 0.35,
          label: "Both OTM",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
        {
          from: 0.35,
          to: 0.65,
          label: "Partial Profit",
          color: "rgba(245, 158, 11, 0.08)",
          textColor: "#f59e0b",
        },
        {
          from: 0.65,
          to: 1.0,
          label: "Max Profit",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
      ],
      annotations: [
        { x: 0.15, y: 0.25, text: "Max Loss", color: "#f472b6", bold: true },
        { x: 0.85, y: 0.65, text: "Max Profit", color: "#4ade80", bold: true },
      ],
    },
    "bull-put-spread": {
      line: [
        { x: 0.05, y: 0.3 },
        { x: 0.35, y: 0.3 },
        { x: 0.65, y: 0.7 },
        { x: 0.95, y: 0.7 },
      ],
      strikes: [
        { at: 0.35, label: "Lower Strike" },
        { at: 0.65, label: "Upper Strike" },
      ],
      breakevens: [{ at: 0.58, label: "Breakeven" }],
      zones: [
        {
          from: 0.0,
          to: 0.35,
          label: "Max Loss",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
        {
          from: 0.35,
          to: 0.65,
          label: "Partial",
          color: "rgba(245, 158, 11, 0.08)",
          textColor: "#f59e0b",
        },
        {
          from: 0.65,
          to: 1.0,
          label: "Max Profit",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
      ],
      annotations: [
        { x: 0.15, y: 0.25, text: "Max Loss", color: "#f472b6", bold: true },
        { x: 0.85, y: 0.65, text: "Max Profit", color: "#4ade80", bold: true },
      ],
    },
    "bear-call-spread": {
      line: [
        { x: 0.05, y: 0.7 },
        { x: 0.35, y: 0.7 },
        { x: 0.65, y: 0.3 },
        { x: 0.95, y: 0.3 },
      ],
      strikes: [
        { at: 0.35, label: "Lower Strike" },
        { at: 0.65, label: "Upper Strike" },
      ],
      breakevens: [{ at: 0.42, label: "Breakeven" }],
      zones: [
        {
          from: 0.0,
          to: 0.35,
          label: "Max Profit",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
        {
          from: 0.35,
          to: 0.65,
          label: "Partial",
          color: "rgba(245, 158, 11, 0.08)",
          textColor: "#f59e0b",
        },
        {
          from: 0.65,
          to: 1.0,
          label: "Max Loss",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
      ],
      annotations: [
        { x: 0.15, y: 0.65, text: "Max Profit", color: "#4ade80", bold: true },
        { x: 0.85, y: 0.25, text: "Max Loss", color: "#f472b6", bold: true },
      ],
    },
    "bear-put-spread": {
      line: [
        { x: 0.05, y: 0.7 },
        { x: 0.35, y: 0.7 },
        { x: 0.65, y: 0.3 },
        { x: 0.95, y: 0.3 },
      ],
      strikes: [
        { at: 0.35, label: "Lower Strike" },
        { at: 0.65, label: "Upper Strike" },
      ],
      breakevens: [{ at: 0.58, label: "Breakeven" }],
      zones: [
        {
          from: 0.0,
          to: 0.35,
          label: "Max Profit",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
        {
          from: 0.35,
          to: 0.65,
          label: "Partial",
          color: "rgba(245, 158, 11, 0.08)",
          textColor: "#f59e0b",
        },
        {
          from: 0.65,
          to: 1.0,
          label: "Max Loss",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
      ],
      annotations: [
        { x: 0.15, y: 0.65, text: "Max Profit", color: "#4ade80", bold: true },
        { x: 0.85, y: 0.25, text: "Max Loss", color: "#f472b6", bold: true },
      ],
    },
    "protective-collar": {
      line: [
        { x: 0.05, y: 0.3 },
        { x: 0.25, y: 0.3 },
        { x: 0.65, y: 0.7 },
        { x: 0.75, y: 0.7 },
        { x: 0.95, y: 0.7 },
      ],
      strikes: [
        { at: 0.25, label: "Put Strike" },
        { at: 0.75, label: "Call Strike" },
      ],
      breakevens: [{ at: 0.4, label: "Breakeven" }],
      zones: [
        {
          from: 0.0,
          to: 0.25,
          label: "Protected",
          color: "rgba(168, 85, 247, 0.08)",
          textColor: "#a855f7",
        },
        {
          from: 0.25,
          to: 0.75,
          label: "Participation",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
        {
          from: 0.75,
          to: 1.0,
          label: "Capped",
          color: "rgba(245, 158, 11, 0.08)",
          textColor: "#f59e0b",
        },
      ],
      annotations: [
        { x: 0.12, y: 0.25, text: "Max Loss", color: "#f472b6", bold: true },
        { x: 0.88, y: 0.65, text: "Max Profit", color: "#4ade80", bold: true },
      ],
    },
    "long-straddle": {
      line: [
        { x: 0.05, y: 0.9 },
        { x: 0.5, y: 0.3 },
        { x: 0.95, y: 0.9 },
      ],
      arrows: [
        { x: 0.05, y: 0.9, dir: "up-left" },
        { x: 0.95, y: 0.9, dir: "up-right" },
      ],
      strikes: [{ at: 0.5, label: "Strike (ATM)" }],
      breakevens: [
        { at: 0.35, label: "BE ↓" },
        { at: 0.65, label: "BE ↑" },
      ],
      zones: [
        {
          from: 0.0,
          to: 0.35,
          label: "Profit ↓",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
        {
          from: 0.35,
          to: 0.65,
          label: "Loss Zone",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
        {
          from: 0.65,
          to: 1.0,
          label: "Profit ↑",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
      ],
      annotations: [
        {
          x: 0.5,
          y: 0.24,
          text: "Max Loss: Both Premiums",
          color: "#f472b6",
          bold: true,
        },
      ],
    },
    "short-straddle": {
      line: [
        { x: 0.05, y: 0.1 },
        { x: 0.5, y: 0.7 },
        { x: 0.95, y: 0.1 },
      ],
      arrows: [
        { x: 0.05, y: 0.1, dir: "down-left" },
        { x: 0.95, y: 0.1, dir: "down-right" },
      ],
      strikes: [{ at: 0.5, label: "Strike (ATM)" }],
      breakevens: [
        { at: 0.35, label: "BE ↓" },
        { at: 0.65, label: "BE ↑" },
      ],
      zones: [
        {
          from: 0.0,
          to: 0.35,
          label: "Loss ↓",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
        {
          from: 0.35,
          to: 0.65,
          label: "Profit Zone",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
        {
          from: 0.65,
          to: 1.0,
          label: "Loss ↑",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
      ],
      annotations: [
        {
          x: 0.5,
          y: 0.65,
          text: "Max Profit: Both Premiums",
          color: "#4ade80",
          bold: true,
        },
      ],
    },
    "long-strangle": {
      line: [
        { x: 0.05, y: 0.9 },
        { x: 0.35, y: 0.35 },
        { x: 0.65, y: 0.35 },
        { x: 0.95, y: 0.9 },
      ],
      arrows: [
        { x: 0.05, y: 0.9, dir: "up-left" },
        { x: 0.95, y: 0.9, dir: "up-right" },
      ],
      strikes: [
        { at: 0.35, label: "Put Strike" },
        { at: 0.65, label: "Call Strike" },
      ],
      breakevens: [
        { at: 0.25, label: "BE ↓" },
        { at: 0.75, label: "BE ↑" },
      ],
      zones: [
        {
          from: 0.0,
          to: 0.35,
          label: "Put Profit",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
        {
          from: 0.35,
          to: 0.65,
          label: "Both OTM (Loss)",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
        {
          from: 0.65,
          to: 1.0,
          label: "Call Profit",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
      ],
      annotations: [
        {
          x: 0.5,
          y: 0.3,
          text: "Max Loss: Both Premiums",
          color: "#f472b6",
          bold: true,
        },
      ],
    },
    "short-strangle": {
      line: [
        { x: 0.05, y: 0.1 },
        { x: 0.35, y: 0.65 },
        { x: 0.65, y: 0.65 },
        { x: 0.95, y: 0.1 },
      ],
      arrows: [
        { x: 0.05, y: 0.1, dir: "down-left" },
        { x: 0.95, y: 0.1, dir: "down-right" },
      ],
      strikes: [
        { at: 0.35, label: "Put Strike" },
        { at: 0.65, label: "Call Strike" },
      ],
      breakevens: [
        { at: 0.25, label: "BE ↓" },
        { at: 0.75, label: "BE ↑" },
      ],
      zones: [
        {
          from: 0.0,
          to: 0.35,
          label: "Loss ↓",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
        {
          from: 0.35,
          to: 0.65,
          label: "Profit Zone",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
        {
          from: 0.65,
          to: 1.0,
          label: "Loss ↑",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
      ],
      annotations: [
        {
          x: 0.5,
          y: 0.6,
          text: "Max Profit: Both Premiums",
          color: "#4ade80",
          bold: true,
        },
      ],
    },
    "iron-condor": {
      line: [
        { x: 0.05, y: 0.3 },
        { x: 0.2, y: 0.3 },
        { x: 0.35, y: 0.65 },
        { x: 0.65, y: 0.65 },
        { x: 0.8, y: 0.3 },
        { x: 0.95, y: 0.3 },
      ],
      strikes: [
        { at: 0.2, label: "K1" },
        { at: 0.35, label: "K2" },
        { at: 0.65, label: "K3" },
        { at: 0.8, label: "K4" },
      ],
      breakevens: [
        { at: 0.28, label: "BE" },
        { at: 0.72, label: "BE" },
      ],
      zones: [
        {
          from: 0.0,
          to: 0.2,
          label: "Max Loss",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
        {
          from: 0.2,
          to: 0.35,
          label: "Put Spread",
          color: "rgba(245, 158, 11, 0.08)",
          textColor: "#f59e0b",
        },
        {
          from: 0.35,
          to: 0.65,
          label: "Max Profit",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
        {
          from: 0.65,
          to: 0.8,
          label: "Call Spread",
          color: "rgba(245, 158, 11, 0.08)",
          textColor: "#f59e0b",
        },
        {
          from: 0.8,
          to: 1.0,
          label: "Max Loss",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
      ],
      annotations: [
        {
          x: 0.5,
          y: 0.6,
          text: "Max Profit: Net Credit",
          color: "#4ade80",
          bold: true,
        },
      ],
    },
    "reverse-iron-condor": {
      line: [
        { x: 0.05, y: 0.65 },
        { x: 0.2, y: 0.65 },
        { x: 0.35, y: 0.35 },
        { x: 0.65, y: 0.35 },
        { x: 0.8, y: 0.65 },
        { x: 0.95, y: 0.65 },
      ],
      strikes: [
        { at: 0.2, label: "K1" },
        { at: 0.35, label: "K2" },
        { at: 0.65, label: "K3" },
        { at: 0.8, label: "K4" },
      ],
      zones: [
        {
          from: 0.0,
          to: 0.2,
          label: "Max Profit",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
        {
          from: 0.35,
          to: 0.65,
          label: "Max Loss",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
        {
          from: 0.8,
          to: 1.0,
          label: "Max Profit",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
      ],
      annotations: [
        {
          x: 0.5,
          y: 0.3,
          text: "Max Loss: Net Debit",
          color: "#f472b6",
          bold: true,
        },
      ],
    },
    "iron-butterfly": {
      line: [
        { x: 0.05, y: 0.3 },
        { x: 0.25, y: 0.3 },
        { x: 0.5, y: 0.7 },
        { x: 0.75, y: 0.3 },
        { x: 0.95, y: 0.3 },
      ],
      strikes: [
        { at: 0.25, label: "Lower Wing" },
        { at: 0.5, label: "Center" },
        { at: 0.75, label: "Upper Wing" },
      ],
      breakevens: [
        { at: 0.38, label: "BE" },
        { at: 0.62, label: "BE" },
      ],
      zones: [
        {
          from: 0.0,
          to: 0.25,
          label: "Max Loss",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
        {
          from: 0.25,
          to: 0.75,
          label: "Profit Zone",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
        {
          from: 0.75,
          to: 1.0,
          label: "Max Loss",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
      ],
      annotations: [
        {
          x: 0.5,
          y: 0.65,
          text: "Max Profit at Center",
          color: "#4ade80",
          bold: true,
        },
      ],
    },
    "long-call-butterfly": {
      line: [
        { x: 0.05, y: 0.4 },
        { x: 0.25, y: 0.4 },
        { x: 0.5, y: 0.75 },
        { x: 0.75, y: 0.4 },
        { x: 0.95, y: 0.4 },
      ],
      strikes: [
        { at: 0.25, label: "Lower" },
        { at: 0.5, label: "Middle" },
        { at: 0.75, label: "Upper" },
      ],
      breakevens: [
        { at: 0.32, label: "BE" },
        { at: 0.68, label: "BE" },
      ],
      zones: [
        {
          from: 0.0,
          to: 0.25,
          label: "Max Loss",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
        {
          from: 0.25,
          to: 0.75,
          label: "Profit Zone",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
        {
          from: 0.75,
          to: 1.0,
          label: "Max Loss",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
      ],
      annotations: [
        {
          x: 0.5,
          y: 0.7,
          text: "Max Profit at Middle",
          color: "#4ade80",
          bold: true,
        },
      ],
    },
    "long-put-butterfly": {
      line: [
        { x: 0.05, y: 0.4 },
        { x: 0.25, y: 0.4 },
        { x: 0.5, y: 0.75 },
        { x: 0.75, y: 0.4 },
        { x: 0.95, y: 0.4 },
      ],
      strikes: [
        { at: 0.25, label: "Lower" },
        { at: 0.5, label: "Middle" },
        { at: 0.75, label: "Upper" },
      ],
      breakevens: [
        { at: 0.32, label: "BE" },
        { at: 0.68, label: "BE" },
      ],
      zones: [
        {
          from: 0.0,
          to: 0.25,
          label: "Max Loss",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
        {
          from: 0.25,
          to: 0.75,
          label: "Profit Zone",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
        {
          from: 0.75,
          to: 1.0,
          label: "Max Loss",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
      ],
      annotations: [
        {
          x: 0.5,
          y: 0.7,
          text: "Max Profit at Middle",
          color: "#4ade80",
          bold: true,
        },
      ],
    },
    "call-ratio-spread": {
      line: [
        { x: 0.05, y: 0.4 },
        { x: 0.3, y: 0.4 },
        { x: 0.55, y: 0.75 },
        { x: 0.95, y: 0.1 },
      ],
      arrows: [{ x: 0.95, y: 0.1, dir: "down-right" }],
      strikes: [
        { at: 0.3, label: "Long Strike" },
        { at: 0.55, label: "Short Strike" },
      ],
      zones: [
        {
          from: 0.0,
          to: 0.3,
          label: "Small Loss/Gain",
          color: "rgba(245, 158, 11, 0.08)",
          textColor: "#f59e0b",
        },
        {
          from: 0.3,
          to: 0.55,
          label: "Profit Zone",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
        {
          from: 0.55,
          to: 1.0,
          label: "Unlimited Risk",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
      ],
      annotations: [
        { x: 0.55, y: 0.7, text: "Max Profit", color: "#4ade80", bold: true },
        {
          x: 0.82,
          y: 0.2,
          text: "⚠️ Unlimited Risk",
          color: "#f472b6",
          bold: true,
        },
      ],
    },
    "put-ratio-spread": {
      line: [
        { x: 0.05, y: 0.1 },
        { x: 0.45, y: 0.75 },
        { x: 0.7, y: 0.4 },
        { x: 0.95, y: 0.4 },
      ],
      arrows: [{ x: 0.05, y: 0.1, dir: "down-left" }],
      strikes: [
        { at: 0.45, label: "Short Strike" },
        { at: 0.7, label: "Long Strike" },
      ],
      zones: [
        {
          from: 0.0,
          to: 0.45,
          label: "Large Risk",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
        {
          from: 0.45,
          to: 0.7,
          label: "Profit Zone",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
        {
          from: 0.7,
          to: 1.0,
          label: "Small Loss/Gain",
          color: "rgba(245, 158, 11, 0.08)",
          textColor: "#f59e0b",
        },
      ],
      annotations: [
        { x: 0.45, y: 0.7, text: "Max Profit", color: "#4ade80", bold: true },
        {
          x: 0.18,
          y: 0.2,
          text: "⚠️ Large Risk",
          color: "#f472b6",
          bold: true,
        },
      ],
    },
    "call-backspread": {
      line: [
        { x: 0.05, y: 0.55 },
        { x: 0.3, y: 0.55 },
        { x: 0.55, y: 0.25 },
        { x: 0.95, y: 0.9 },
      ],
      arrows: [{ x: 0.95, y: 0.9, dir: "up-right" }],
      strikes: [
        { at: 0.3, label: "Short Strike" },
        { at: 0.55, label: "Long Strike" },
      ],
      zones: [
        {
          from: 0.0,
          to: 0.3,
          label: "Small Gain",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
        {
          from: 0.3,
          to: 0.55,
          label: "Max Loss",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
        {
          from: 0.55,
          to: 1.0,
          label: "Unlimited Profit",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
      ],
      annotations: [
        {
          x: 0.55,
          y: 0.2,
          text: "Max Loss Zone",
          color: "#f472b6",
          bold: true,
        },
        {
          x: 0.82,
          y: 0.75,
          text: "Unlimited Profit ↗",
          color: "#4ade80",
          bold: true,
        },
      ],
    },
    "put-backspread": {
      line: [
        { x: 0.05, y: 0.9 },
        { x: 0.45, y: 0.25 },
        { x: 0.7, y: 0.55 },
        { x: 0.95, y: 0.55 },
      ],
      arrows: [{ x: 0.05, y: 0.9, dir: "up-left" }],
      strikes: [
        { at: 0.45, label: "Long Strike" },
        { at: 0.7, label: "Short Strike" },
      ],
      zones: [
        {
          from: 0.0,
          to: 0.45,
          label: "Large Profit",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
        {
          from: 0.45,
          to: 0.7,
          label: "Max Loss",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
        {
          from: 0.7,
          to: 1.0,
          label: "Small Gain",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
      ],
      annotations: [
        {
          x: 0.45,
          y: 0.2,
          text: "Max Loss Zone",
          color: "#f472b6",
          bold: true,
        },
        {
          x: 0.18,
          y: 0.75,
          text: "Large Profit ↙",
          color: "#4ade80",
          bold: true,
        },
      ],
    },
    "synthetic-long": {
      line: [
        { x: 0.05, y: 0.1 },
        { x: 0.95, y: 0.9 },
      ],
      arrows: [{ x: 0.95, y: 0.9, dir: "up-right" }],
      strikes: [{ at: 0.5, label: "Strike" }],
      breakevens: [{ at: 0.5, label: "Breakeven" }],
      zones: [
        {
          from: 0.0,
          to: 0.5,
          label: "Loss",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
        {
          from: 0.5,
          to: 1.0,
          label: "Profit",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
      ],
      annotations: [
        {
          x: 0.5,
          y: 0.55,
          text: "Mimics owning stock",
          color: "#94a3b8",
          bold: true,
        },
      ],
    },
    "synthetic-short": {
      line: [
        { x: 0.05, y: 0.9 },
        { x: 0.95, y: 0.1 },
      ],
      arrows: [{ x: 0.95, y: 0.1, dir: "down-right" }],
      strikes: [{ at: 0.5, label: "Strike" }],
      breakevens: [{ at: 0.5, label: "Breakeven" }],
      zones: [
        {
          from: 0.0,
          to: 0.5,
          label: "Profit",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
        {
          from: 0.5,
          to: 1.0,
          label: "Loss",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
      ],
      annotations: [
        {
          x: 0.5,
          y: 0.55,
          text: "Mimics shorting stock",
          color: "#94a3b8",
          bold: true,
        },
      ],
    },
    "jade-lizard": {
      line: [
        { x: 0.05, y: 0.1 },
        { x: 0.3, y: 0.5 },
        { x: 0.35, y: 0.65 },
        { x: 0.6, y: 0.65 },
        { x: 0.75, y: 0.55 },
        { x: 0.95, y: 0.55 },
      ],
      strikes: [
        { at: 0.35, label: "Put Strike" },
        { at: 0.6, label: "Short Call" },
        { at: 0.75, label: "Long Call" },
      ],
      zones: [
        {
          from: 0.0,
          to: 0.35,
          label: "Downside Risk",
          color: "rgba(244, 114, 182, 0.08)",
          textColor: "#f472b6",
        },
        {
          from: 0.35,
          to: 0.6,
          label: "Max Profit",
          color: "rgba(74, 222, 128, 0.08)",
          textColor: "#4ade80",
        },
        {
          from: 0.6,
          to: 0.75,
          label: "Reduced",
          color: "rgba(245, 158, 11, 0.08)",
          textColor: "#f59e0b",
        },
        {
          from: 0.75,
          to: 1.0,
          label: "No Upside Risk",
          color: "rgba(148, 163, 184, 0.08)",
          textColor: "#94a3b8",
        },
      ],
      annotations: [
        {
          x: 0.15,
          y: 0.2,
          text: "Only downside risk",
          color: "#f472b6",
          bold: true,
        },
        {
          x: 0.88,
          y: 0.5,
          text: "No risk here!",
          color: "#4ade80",
          bold: true,
        },
      ],
    },
  };

  return shapes[id] || null;
}
