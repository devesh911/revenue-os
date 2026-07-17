// Org switcher container — org selection lives in the URL (R7: sharable location → URL). Query
// state comes from the hook; the presentation (including error ≠ empty) lives in OrgSwitcherView.
import { useLocation, useParams } from "wouter";
import { useOrgsQuery } from "../features/orgs/api";
import { OrgSwitcherView } from "./OrgSwitcherView";

export function OrgSwitcher() {
  const { data: orgs, isLoading, isError } = useOrgsQuery();
  const params = useParams<{ orgId?: string }>();
  const [location, navigate] = useLocation();

  const current = params.orgId ?? orgs?.[0]?.id;
  const screen = location.split("/")[3] ?? "tasks";

  return (
    <OrgSwitcherView
      isLoading={isLoading}
      isError={isError}
      orgs={orgs}
      current={current}
      onSelect={(orgId) => navigate(`/o/${orgId}/${screen}`)}
    />
  );
}
