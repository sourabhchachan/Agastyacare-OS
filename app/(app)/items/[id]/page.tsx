import { redirect } from "next/navigation";

export default function ItemDetailRedirectPage() {
  redirect("/tasks");
}
