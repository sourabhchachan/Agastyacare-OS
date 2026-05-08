import { redirect } from "next/navigation";

export default function RaiseItemPage() {
  redirect("/tasks/new");
}
