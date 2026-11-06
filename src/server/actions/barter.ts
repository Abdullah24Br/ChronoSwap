"use server";

import { defineAction } from "@/server/action";
import { getCurrentUser } from "@/server/auth/session";
import { ForbiddenError } from "@/server/errors";
import {
  proposeBarterCycle,
  respondToBarterProposal,
} from "@/server/services/barter/barter-service";
import {
  proposeBarterCycleSchema,
  respondBarterProposalSchema,
} from "@/server/services/barter/schemas";

// FR-3.4: Server actions for proposing and responding to 3-way barter cycles.

export const proposeBarterCycleAction = defineAction(
  proposeBarterCycleSchema,
  async (input) => {
    const user = await getCurrentUser();
    if (!user) {
      throw new ForbiddenError("يجب تسجيل الدخول لتقديم اقتراح مقايضة");
    }

    return proposeBarterCycle(user.id, input);
  },
);

export const respondBarterProposalAction = defineAction(
  respondBarterProposalSchema,
  async (input) => {
    const user = await getCurrentUser();
    if (!user) {
      throw new ForbiddenError("يجب تسجيل الدخول للرد على اقتراح المقايضة");
    }

    return respondToBarterProposal(user.id, input);
  },
);

