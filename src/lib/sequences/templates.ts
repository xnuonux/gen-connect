import { type SequenceGraph } from "@/lib/types/sequence";

// starter templates ... pure + client-safe (importable from the action too, so the
// server resolves a templateId without trusting a client-sent graph). each graph is
// closer-instinct + dom voice: spintax {{a|b}} and {signal.*}/{contact.*}/{voice.*}
// slots baked in, so the wedge is visible the instant a sequence is created. they
// all pass validateGraph (one start, every leaf reaches an end, sends have a body,
// conditions wire true + false).

export type SequenceTemplate = {
  id: string;
  name: string;
  description: string;
  graph: SequenceGraph;
};

const BLANK: SequenceGraph = {
  nodes: [{ id: "start", type: "start", position: { x: 280, y: 30 }, data: {} }],
  edges: [],
};

// start -> first touch -> wait 3d -> bump -> wait 4d -> breakup -> end
const THREE_TOUCH: SequenceGraph = {
  nodes: [
    { id: "start", type: "start", position: { x: 300, y: 20 }, data: {} },
    {
      id: "s1",
      type: "send",
      position: { x: 260, y: 130 },
      data: {
        channel: "email",
        subject: "quick one about {signal.hook}",
        body: "saw {signal.hook} ... {{nice work|strong move|big}}. i help {contact.title} folks open doors without sounding like a template. worth a quick look?",
      },
    },
    { id: "w1", type: "wait", position: { x: 300, y: 250 }, data: { amount: 3, unit: "days" } },
    {
      id: "s2",
      type: "send",
      position: { x: 260, y: 360 },
      data: {
        channel: "email",
        subject: "re: {signal.company}",
        body: "{{floating this back up|quick nudge}} ... still think the {signal.company} timing is right. open to it?",
      },
    },
    { id: "w2", type: "wait", position: { x: 300, y: 480 }, data: { amount: 4, unit: "days" } },
    {
      id: "s3",
      type: "send",
      position: { x: 260, y: 590 },
      data: {
        channel: "email",
        subject: "last one",
        body: "i'll stop here ... if the timing shifts you know where to find me. {{no hard feelings|all good either way}}.",
      },
    },
    { id: "end", type: "end", position: { x: 300, y: 710 }, data: { action: "completed" } },
  ],
  edges: [
    { id: "e1", source: "start", target: "s1", sourceHandle: null },
    { id: "e2", source: "s1", target: "w1", sourceHandle: null },
    { id: "e3", source: "w1", target: "s2", sourceHandle: null },
    { id: "e4", source: "s2", target: "w2", sourceHandle: null },
    { id: "e5", source: "w2", target: "s3", sourceHandle: null },
    { id: "e6", source: "s3", target: "end", sourceHandle: null },
  ],
};

// start -> launch congrats -> wait 2d -> the offer -> end
const LAUNCH_CONGRATS: SequenceGraph = {
  nodes: [
    { id: "start", type: "start", position: { x: 300, y: 20 }, data: {} },
    {
      id: "s1",
      type: "send",
      position: { x: 260, y: 130 },
      data: {
        channel: "email",
        subject: "{signal.product_name} ...",
        body: "{{saw|caught}} the {signal.product_name} launch ... {{congrats|love it}}. the first 100 users are the hardest part. happy to share what worked for us if useful.",
      },
    },
    { id: "w1", type: "wait", position: { x: 300, y: 250 }, data: { amount: 2, unit: "days" } },
    {
      id: "s2",
      type: "send",
      position: { x: 260, y: 360 },
      data: {
        channel: "email",
        subject: "the thing i mentioned",
        body: "{{here's the one move|the thing i'd do first}} ... it's the message-feels-like-you part. tuesday or thursday if you want to see it on {signal.company}?",
      },
    },
    { id: "end", type: "end", position: { x: 300, y: 480 }, data: { action: "completed" } },
  ],
  edges: [
    { id: "e1", source: "start", target: "s1", sourceHandle: null },
    { id: "e2", source: "s1", target: "w1", sourceHandle: null },
    { id: "e3", source: "w1", target: "s2", sourceHandle: null },
    { id: "e4", source: "s2", target: "end", sourceHandle: null },
  ],
};

// start -> first touch -> wait 3d -> condition(opened) -> [true] warm follow -> end
//                                                       -> [false] re-angle -> end
const OPENED_OR_NOT: SequenceGraph = {
  nodes: [
    { id: "start", type: "start", position: { x: 320, y: 20 }, data: {} },
    {
      id: "s1",
      type: "send",
      position: { x: 280, y: 130 },
      data: {
        channel: "email",
        subject: "quick one, {contact.name}",
        body: "saw {signal.hook} ... {{worth a look|thought of you}}. i do the message-feels-like-you thing for {contact.title} folks. open to a peek?",
      },
    },
    { id: "w1", type: "wait", position: { x: 320, y: 250 }, data: { amount: 3, unit: "days" } },
    { id: "c1", type: "condition", position: { x: 320, y: 360 }, data: { check: "opened" } },
    {
      id: "warm",
      type: "send",
      position: { x: 140, y: 480 },
      data: {
        channel: "email",
        subject: "since you peeked",
        body: "{{since this caught your eye|figured i'd follow}} ... here's the 30-second version for {signal.company}. tuesday?",
      },
    },
    {
      id: "reangle",
      type: "send",
      position: { x: 500, y: 480 },
      data: {
        channel: "email",
        subject: "different angle",
        body: "maybe that missed ... {{simpler version|one line}}: i make your cold outreach sound like you, not jasper. curious?",
      },
    },
    { id: "end", type: "end", position: { x: 320, y: 610 }, data: { action: "completed" } },
  ],
  edges: [
    { id: "e1", source: "start", target: "s1", sourceHandle: null },
    { id: "e2", source: "s1", target: "w1", sourceHandle: null },
    { id: "e3", source: "w1", target: "c1", sourceHandle: null },
    { id: "e4", source: "c1", target: "warm", sourceHandle: "true" },
    { id: "e5", source: "c1", target: "reangle", sourceHandle: "false" },
    { id: "e6", source: "warm", target: "end", sourceHandle: null },
    { id: "e7", source: "reangle", target: "end", sourceHandle: null },
  ],
};

export const SEQUENCE_TEMPLATES: SequenceTemplate[] = [
  {
    id: "blank",
    name: "blank",
    description: "a lone start node ... build it your way.",
    graph: BLANK,
  },
  {
    id: "three-touch",
    name: "3-touch cold open",
    description: "first touch, a bump, a breakup ... the classic spaced over a week.",
    graph: THREE_TOUCH,
  },
  {
    id: "launch-congrats",
    name: "launch congrats",
    description: "ride a product launch signal ... congrats first, the offer two days later.",
    graph: LAUNCH_CONGRATS,
  },
  {
    id: "opened-or-not",
    name: "opened, or not",
    description: "branch on the open ... warm follow if they peeked, a re-angle if they didn't.",
    graph: OPENED_OR_NOT,
  },
];

export function templateById(id: string): SequenceTemplate | undefined {
  return SEQUENCE_TEMPLATES.find((t) => t.id === id);
}
