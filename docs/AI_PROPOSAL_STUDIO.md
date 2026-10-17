# AI Proposal Studio and Personalized PDFs

## What it does

Infiskies Finance includes an owner-only proposal workspace that turns a business profile and client brief into a proposal draft. The owner can edit the generated wording, set the final estimate, edit payment milestones, preview the branded PDF in a browser tab, download it, or create/send the proposal to a client portal.

The generated draft is personalized from:
- Business profile, services and differentiators
- Client contact/company and linked sales lead details (when supplied)
- Client problem, objectives and requested deliverables
- Budget indication and target timeline
- Writing tone and additional instructions
- Existing terms supplied by the owner

## AI runtime

- Primary: `onnx-community/Qwen2.5-0.5B-Instruct` through `@huggingface/transformers`.
- Fallback: `onnx-community/SmolLM2-360M-ONNX` for browser/device compatibility.
- Inference runs in the browser. The first use downloads model weights from Hugging Face and the library caches them locally; the proposal brief is not sent to a hosted text-generation API.
- Local inference performance depends on the browser, device memory and GPU/WebGPU support. If a model cannot load, the UI reports an error and manual editing remains available.

The models are pretrained open-weight models, not a model trained from scratch for Infiskies. Treat output as an editable first draft, not a source of truth.

## PDF workflow

1. Fill in the business profile and client requirements.
2. Generate the draft and verify its title, scope, deliverables, assumptions and dates.
3. Select the client and edit the final estimate and milestone percentages. The percentage total must equal 100% before sending.
4. Use **Preview PDF** to check layout, then download or create/send the portal proposal.
5. Confirm the estimate, delivery timeline, legal/commercial terms and milestones manually before sharing with a client.

The PDF is built client-side with jsPDF. It includes business branding/contact details, recipient information, estimated investment, client requirements (when supplied), scope, delivery/terms, milestone amounts and page numbers. Large text blocks are split across pages.

## Validation checklist

- Generate a proposal with only objectives, only deliverables, and with both fields.
- Verify model fallback/manual recovery when WebGPU is unavailable.
- Verify the correct client is shown in the PDF; historical proposal downloads must not inherit the currently edited client's brief.
- Preview and download PDFs with long scope/terms and many milestones; confirm no content overlaps the footer or page edges.
- Confirm blank budget remains blank, the AI does not set a made-up price, and milestone percentages must be reviewed and total 100%.
- Run `npm run build` and `npm run lint`; verify the preview/download flows in the target browsers before production use.
