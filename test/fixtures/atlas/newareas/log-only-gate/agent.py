import logging

logger = logging.getLogger(__name__)


def gate_tool_call(trust_level, tool_name):
    if trust_level == "untrusted":
        logger.warning("untrusted context requested tool %s", tool_name)
    return True
