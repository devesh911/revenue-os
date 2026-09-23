import { bookDemo } from "./site";

// Copy for the booking dialog (visuals/BookingDialog.tsx). `{…}` placeholders are
// filled by the dialog. The title is the same label every demo button carries.

export const bookingCopy = {
  title: bookDemo,
  length: "30 minutes, by video",
  steps: { time: "Choose a time", details: "Your details" },
  timezone: "Times shown in {zone}",
  loading: "Finding open times…",
  empty: "No open times in the next two weeks. Please check back soon.",
  loadError: "We couldn't load open times.",
  retry: "Try again",
  change: "Change",
  fields: {
    name: "Name",
    email: "Work email",
    company: "Company",
    phone: "Phone (optional)",
    phoneHint:
      "Indian numbers work as typed; otherwise start with the country code (for example +44).",
    // Outside India a local number can't be read as Indian, so every number needs its code.
    phoneHintIntl: "Start with the country code (for example +91 or +44).",
  },
  errors: {
    name: "Enter your name.",
    email: "Enter a valid work email.",
    company: "Enter your company name.",
    phone:
      "Enter a valid phone number (with the country code if it isn't Indian), or leave it empty.",
    phoneIntl:
      "Enter a valid phone number starting with the country code, or leave it empty.",
  },
  submit: "Confirm booking",
  submitting: "Booking…",
  submitError: "That didn't go through. Please try again.",
  slotTaken: "That time was just taken. Please choose another.",
  confirmTitle: "You're booked",
  confirmWhen: "{date} at {time}",
  confirmInvite: "A calendar invite is on its way to {email}.",
  confirmCovers: "On the call we'll cover:",
  close: "Close",
  preview: "Preview: booking isn't connected yet, so nothing is sent.",
  // Preview mode books nothing, so its last step says so instead of promising an invite.
  previewConfirm: {
    title: "Preview complete",
    invite:
      "Nothing was booked. Once booking is connected, a calendar invite goes to {email}.",
  },
} as const;
