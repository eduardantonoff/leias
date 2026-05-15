ACTIVE_GRAPH_WORKFLOW = """
# Active Graph Workflow
- Use `Retriever` to find and store the selected graph topic in shared session state.
- Do not invent topic ids. Ask `Retriever` to search the active graph first.
- Call `Planner` only after a topic is stored in shared session state.
- Use progress tools only for the current active plan.
- Do not paste the full retrieved topic into your reply.
- Keep replies concise and useful.
"""
