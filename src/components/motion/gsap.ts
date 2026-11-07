"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { Flip } from "gsap/Flip";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

// One place that registers every GSAP plugin the app uses. Import gsap from here, not "gsap".
gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText, Flip, DrawSVGPlugin, CustomEase);

// House eases: "astro" settles like a brass ring coming to rest; "swap" is the exchange sweep.
CustomEase.create("astro", "M0,0 C0.16,0.84 0.28,1.02 0.52,1.01 0.73,1.0 0.86,1 1,1");
CustomEase.create("swap", "M0,0 C0.7,0 0.2,1 1,1");

export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
export const FULL_MOTION = "(prefers-reduced-motion: no-preference)";

export { gsap, useGSAP, ScrollTrigger, SplitText, Flip };
