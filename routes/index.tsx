import { page } from "./$index.ts";
import { LinkForm } from "../components/LinkForm.tsx";

export default page(function Home() {
  return (
    <main>
      <h1>Interrail → Calendar</h1>
      <p>
        Turn a trip from the Interrail / Eurail <strong>Rail Planner</strong> app into calendar events.
      </p>
      <LinkForm />
      <ol class="help">
        <li>In Rail Planner, open <em>My Trips</em> and pick a trip.</li>
        <li>Tap <em>Share</em> → <em>Share as a link</em> and paste it above.</li>
        <li>Pick the trains you want and download the <code>.ics</code> file.</li>
      </ol>
    </main>
  );
});
