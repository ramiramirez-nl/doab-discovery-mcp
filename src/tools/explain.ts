const EXPLANATIONS: Record<string, string> = {
  doab: "DOAB (Directory of Open Access Books) indexes peer-reviewed open-access books and book chapters from academic publishers. It is a discovery index of descriptive metadata, not a full-text repository; the files themselves live with the publisher or in OAPEN.",
  handle:
    "A handle is DOAB's persistent identifier for a record, shaped like 20.500.12854/32785, and resolves at https://directory.doabooks.org/handle/<handle>. DOAB books have no ISSN, so the handle (or a DOI, where the publisher registered one) is the stable way to cite a specific record.",
  chapter:
    "DOAB indexes both whole books (dc.type: book) and individual chapters (dc.type: chapter) contributed by publishers. Chapter records carry their own title, abstract and often their own DOI, and link back to the parent book.",
  "peer review":
    "DOAB records may carry structured peer-review metadata: review type (proposal, full manuscript), anonymity (single- or double-anonymised), reviewer type (internal editor, external peer reviewer), review stage, and who is responsible for the process. The metadata is publisher-supplied and describes the declared process, not an assessment of it. Not every record has it.",
  license:
    "DOAB stores dc.rights as a coarse 'open access' flag, with the specific reuse terms usually in the publisher's own licence statement (publisher.oalicense) rather than as a machine-readable CC code on the record. Check the book's landing page for the exact licence before relying on it.",
  thema:
    "Thema is a subject classification scheme for the book trade. DOAB stores Thema and BIC strings inside dc.subject.other alongside free-text keywords, which is why subject lists mix plain keywords with strings like 'thema EDItEUR::J Society and Social Sciences'.",
  language:
    "DOAB records publication language as a name ('English', 'Turkish', 'German'), not an ISO code. This server accepts either spelling and normalises it before querying.",
  publisher:
    "Each DOAB record links to a publisher profile carrying name, country, website, peer-review policy and open-access licence statement. Publisher country is present in the metadata but is not searchable as a filter, so this server uses it for ranking and display only.",
  oapen:
    "OAPEN is the library and hosting platform that operates alongside DOAB and runs its infrastructure. DOAB records frequently point to an OAPEN landing page or carry oapen.* metadata fields such as oapen.identifier.doi, oapen.imprint and oapen.pages."
};

export const explainDoabMetadata = (term: string): string => {
  const key = term.trim().toLowerCase();
  return (
    EXPLANATIONS[key] ??
    "DOAB metadata describes open-access books and chapters for discovery: title, authors and editors, abstract, publisher and imprint, publication year and place, language, subjects and Thema classification, series, pages, DOI, ISBN, funder, declared peer-review process, and landing-page links. This server searches and ranks that metadata for discovery only, not editorial review."
  );
};
