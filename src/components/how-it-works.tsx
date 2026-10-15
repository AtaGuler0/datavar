import { ContributorSpec } from "./contributor-spec";
import { NightHeading, Plate } from "./night";
import { Reveal } from "./reveal";
import {
  ApproveFigure,
  ConnectFigure,
  Ledger,
  PaidFigure,
} from "./step-figures";
import { StepScroll, type Step } from "./step-scroll";
import { SystemDiagram } from "./system-diagram";

const STEPS: Step[] = [
  {
    title: "Bring what you already have.",
    body: "Export what a service holds on you, or pick files you already keep, and upload them. Each file is hashed on your device before it leaves, and nothing is offered to anyone until you say so.",
    stat: {
      value: "On-device",
      label: "hashing",
      note: "SHA-256 before upload · nothing listed without consent",
    },
    stage: "Upload",
    share: 30,
    fig: "Fig 1.1",
    tag: "Intake",
    caption: ["Browsing · health · purchases · media", "hashed on device"],
    figure: <ConnectFigure />,
  },
  {
    title: "Nothing leaves until you approve it.",
    body: "You approve each dataset, each buyer, and each purpose separately. Every approval is written as a signed consent receipt with an expiry date.",
    stat: {
      value: "1 receipt",
      label: "per dataset, buyer and purpose",
      note: "signed on Stellar · no end date, no consent",
    },
    stage: "Approve",
    share: 30,
    fig: "Fig 1.2",
    tag: "Gate",
    caption: ["Per buyer · per purpose", "declined stays declined"],
    figure: <ApproveFigure />,
  },
  {
    title: "Get paid when it sells.",
    body: "Rare, high-signal data earns more than common data. Earnings are held in a contract on Stellar and leave it on your signature alone, with the transaction hash to check them against.",
    stat: {
      value: "USDC",
      label: "paid out of the contract",
      note: "claimed on your signature alone",
    },
    stage: "Paid",
    share: 40,
    fig: "Fig 1.3",
    tag: "Payout",
    caption: ["Settled on Stellar", "illustrative ledger"],
    figure: (
      <>
        <PaidFigure />
        <Ledger />
      </>
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="bg-night">
      <div className="mx-auto max-w-6xl px-6 py-28 sm:py-36">
        <NightHeading
          eyebrow="For people"
          title="Your data. Your terms."
          aside="Nothing moves until you say so, and when it moves, you're paid."
          className="max-w-3xl"
        />

        <Reveal delay={120}>
          <Plate
            fig="Fig 0.1"
            tag="System"
            className="mt-16"
            bodyClassName="overflow-hidden px-2 sm:px-8"
            caption={
              <>
                <span>Consent and data travel right</span>
                <span>The payout comes back</span>
              </>
            }
          >
            {/* Scrolls sideways on a phone rather than shrinking the labels
                past reading: the drawing is wide by nature. */}
            <div className="overflow-x-auto overscroll-x-contain">
              <SystemDiagram className="mx-auto h-auto w-full min-w-[680px] max-w-5xl" />
            </div>
          </Plate>
        </Reveal>

        {/* The contributor side opened like a product, Caveman-style, then
            walked through step by step. */}
        <div className="mt-32 sm:mt-44">
          <ContributorSpec />
        </div>

        <StepScroll steps={STEPS} />
      </div>
    </section>
  );
}
